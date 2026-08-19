import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Closes } from '../src/engine/types.ts'
import {
  DATASET_VERSION,
  type Manifest,
  type SecurityRecord,
  type SeriesFile,
  type UniverseFile,
} from '../src/domain/dataset.ts'

/**
 * Publishing.
 *
 * Written to a staging directory and moved into place in one rename, so the
 * site is never served a half-written dataset. If anything throws part-way
 * through, the previous publication is still sitting there intact.
 *
 * The split is what makes the list open instantly. `universe.json` holds every
 * number the ranked list needs and is the only request made at startup. Price
 * series are one file per ticker and are fetched only when a chart or a
 * portfolio calculation actually needs them, so a phone never downloads three
 * years of daily closes for 1,500 names in order to sort a column.
 */

export interface PublishInput {
  readonly manifest: Manifest
  readonly securities: readonly SecurityRecord[]
  readonly calendar: readonly string[]
  /** Aligned closes for every security and benchmark. */
  readonly closes: ReadonlyMap<string, Closes>
  readonly benchmarks: readonly string[]
}

export interface PublishResult {
  readonly directory: string
  readonly files: number
  readonly bytes: number
}

export async function publish(target: string, input: PublishInput): Promise<PublishResult> {
  const staging = `${target}.staging`
  await rm(staging, { recursive: true, force: true })
  await mkdir(join(staging, 'series'), { recursive: true })

  let bytes = 0
  let files = 0
  const write = async (path: string, body: string) => {
    await writeFile(join(staging, path), body)
    bytes += Buffer.byteLength(body)
    files++
  }

  await write('manifest.json', JSON.stringify(input.manifest))

  const universe: UniverseFile = {
    version: DATASET_VERSION,
    asOf: input.manifest.asOf,
    securities: input.securities,
  }
  // Six decimals on every published number. A return carries about four
  // meaningful digits and the interface shows one; the seventeen digits a
  // float serialises to are a third of this file's transfer size spent on
  // precision nobody can see. Integers such as market cap pass through
  // untouched.
  await write(
    'universe.json',
    JSON.stringify(universe, (_key, value: unknown) =>
      typeof value === 'number' && Number.isFinite(value)
        ? Math.round(value * 1e6) / 1e6
        : value,
    ),
  )

  const publishSeries = async (ticker: string) => {
    const closes = input.closes.get(ticker)
    if (!closes) return
    // Trimmed to the span the security actually has data for: leading nulls
    // for a name that listed last year are bytes that say nothing.
    let first = 0
    while (first < closes.length && closes[first] === null) first++
    const file: SeriesFile = {
      ticker,
      dates: input.calendar.slice(first),
      closes: closes.slice(first).map((c) => (c === null ? null : round(c))),
    }
    await write(join('series', `${encodeURIComponent(ticker)}.json`), JSON.stringify(file))
  }

  for (const s of input.securities) await publishSeries(s.ticker)
  for (const b of input.benchmarks) await publishSeries(b)

  // One rename: either the whole dataset is live or none of it is.
  await rm(target, { recursive: true, force: true })
  await rename(staging, target)

  return { directory: target, files, bytes }
}

/**
 * Four significant decimals.
 *
 * Adjusted closes carry long fractional tails from years of dividend
 * adjustments; the digits past the fourth are smaller than a return this app
 * can display and cost about a third of the transfer size.
 */
function round(value: number): number {
  return Math.round(value * 10000) / 10000
}
