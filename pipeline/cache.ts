import { mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Fmp, PricePoint } from './fmp.ts'
import { pooled } from './fmp.ts'

/**
 * The adjusted-price cache.
 *
 * The refresh is incremental by construction. Each ticker's settled history
 * lives in one file; a run asks the provider only for the days after the last
 * one already held, merges them, and moves on. A full three-year fetch happens
 * once, when the cache is cold.
 *
 * The rule that shapes everything here: **a failed provider request must never
 * destroy good history.** A ticker whose fetch fails keeps every close it
 * already had and is marked stale for the run summary. Nothing is deleted on
 * the strength of an error response.
 *
 * Delisted and dropped names are kept rather than removed, so a name that
 * leaves an index and comes back does not need its history refetched, and a
 * membership change can never truncate a series.
 */

export interface CachedSeries {
  readonly ticker: string
  /** ISO date of the last successful provider response. */
  readonly refreshedAt: string
  readonly points: PricePoint[]
}

export interface RefreshOutcome {
  readonly ticker: string
  readonly added: number
  readonly total: number
  readonly stale: boolean
  readonly error?: string
}

export class PriceCache {
  private readonly directory: string

  constructor(directory: string) {
    this.directory = directory
  }

  private path(ticker: string): string {
    // Tickers are `[A-Z0-9.-]`, so this cannot escape the directory, but the
    // encoding keeps class shares (`BRK-B`) safe on every filesystem.
    return join(this.directory, `${encodeURIComponent(ticker)}.json`)
  }

  async ensure(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
  }

  async read(ticker: string): Promise<CachedSeries | null> {
    try {
      const raw = await readFile(this.path(ticker), 'utf8')
      const parsed = JSON.parse(raw) as CachedSeries
      if (!Array.isArray(parsed?.points)) return null
      return { ticker, refreshedAt: parsed.refreshedAt ?? '', points: parsed.points }
    } catch {
      return null
    }
  }

  async write(series: CachedSeries): Promise<void> {
    await writeFile(this.path(series.ticker), JSON.stringify(series))
  }

  async tickers(): Promise<string[]> {
    try {
      const files = await readdir(this.directory)
      return files.filter((f) => f.endsWith('.json')).map((f) => decodeURIComponent(f.slice(0, -5)))
    } catch {
      return []
    }
  }

  /** Drops cached names no longer worth keeping, e.g. after a universe change. */
  async forget(ticker: string): Promise<void> {
    await rm(this.path(ticker), { force: true })
  }
}

/**
 * Merges newly fetched points into a cached series.
 *
 * Later observations win on a date collision: the provider restating a close
 * after a corporate action is a correction, and the correction is the one to
 * keep. Anything before `retainFrom` is dropped so the cache does not grow
 * without bound.
 */
export function mergePoints(
  cached: readonly PricePoint[],
  fetched: readonly PricePoint[],
  retainFrom: string,
): PricePoint[] {
  const byDate = new Map<string, number>()
  for (const p of cached) byDate.set(p.date, p.close)
  for (const p of fetched) byDate.set(p.date, p.close)
  return [...byDate]
    .filter(([date, close]) => date >= retainFrom && Number.isFinite(close) && close > 0)
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * The date to ask the provider from.
 *
 * Re-requesting a short overlap rather than starting the day after the last
 * cached close lets the provider restate recent days — adjustments for a
 * dividend land on prices that were already published — without a full
 * refetch. A cold cache asks for the whole retention window.
 */
export function fetchFrom(cached: readonly PricePoint[], coldStart: string, overlapDays = 7): string {
  const last = cached.at(-1)?.date
  if (!last) return coldStart
  const d = new Date(`${last}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - overlapDays)
  const from = d.toISOString().slice(0, 10)
  return from > coldStart ? from : coldStart
}

export interface RefreshOptions {
  readonly from: string
  readonly to: string
  readonly retainFrom: string
  readonly onProgress?: (done: number, total: number) => void
}

/** Brings every listed ticker up to date, one file each, in parallel. */
export async function refresh(
  cache: PriceCache,
  fmp: Fmp,
  tickers: readonly string[],
  options: RefreshOptions,
): Promise<Map<string, RefreshOutcome>> {
  await cache.ensure()
  const today = new Date().toISOString().slice(0, 10)
  let done = 0

  const outcomes = await pooled(tickers, fmp.concurrency, async (ticker) => {
    const existing = await cache.read(ticker)
    const cached = existing?.points ?? []
    const from = fetchFrom(cached, options.from)

    try {
      const fetched = await fmp.adjustedCloses(ticker, from, options.to)
      const merged = mergePoints(cached, fetched, options.retainFrom)
      await cache.write({ ticker, refreshedAt: today, points: merged })
      return {
        ticker,
        added: merged.length - cached.length,
        total: merged.length,
        stale: fetched.length === 0 && cached.length > 0,
      }
    } catch (error) {
      // The good history stays exactly as it was. A provider outage costs a
      // day of freshness, never the dataset.
      const message = error instanceof Error ? error.message : String(error)
      if (cached.length > 0) {
        await cache.write({
          ticker,
          refreshedAt: existing?.refreshedAt ?? '',
          points: mergePoints(cached, [], options.retainFrom),
        })
      }
      return { ticker, added: 0, total: cached.length, stale: true, error: message }
    } finally {
      options.onProgress?.(++done, tickers.length)
    }
  })

  return new Map(outcomes.map((o) => [o.ticker, o]))
}
