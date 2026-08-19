import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { EarningsEvent, Fmp } from './fmp.ts'

/**
 * The production earnings store: recent announcements for the whole market
 * in one file, fed by the ranged calendar endpoint — two short requests on a
 * daily run instead of 1,500 per-symbol ones.
 *
 * Two rules carry all the weight:
 *
 *  - **Frozen once captured.** A (symbol, date) row is written once and a
 *    later provider restatement never rewrites it. What the estimate said at
 *    announcement is what was knowable; the surprise metric's honesty
 *    depends on that staying true. New announcement dates append; captured
 *    rows are immutable.
 *  - **Bounded window.** Only the trailing ~220 calendar days are retained —
 *    the surprise metric looks back 63 trading days, and hoarding a decade
 *    of announcements in a production cache would be the Lab's job leaking
 *    into the product.
 */

/** Calendar days of announcements retained and cold-started. */
export const RETENTION_DAYS = 220

/** Ranged requests stay short of the endpoint's row cap. */
const CHUNK_DAYS = 14

/** Refetch overlap: late-arriving rows near the boundary get one more look. */
const OVERLAP_DAYS = 7

export interface EarningsStoreFile {
  /** Last calendar date the store has fetched through. */
  readonly fetchedTo: string
  /** Events by normalised symbol, oldest first. */
  readonly bySymbol: Record<string, EarningsEvent[]>
}

export async function readStore(path: string): Promise<EarningsStoreFile | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as EarningsStoreFile
    if (typeof parsed?.fetchedTo !== 'string' || typeof parsed?.bySymbol !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export async function writeStore(path: string, store: EarningsStoreFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(store))
}

/** Frozen-once merge: existing (symbol, date) rows win; new dates append. */
export function mergeCalendar(
  existing: EarningsStoreFile['bySymbol'],
  fetched: readonly (EarningsEvent & { symbol: string })[],
  retainFrom: string,
): EarningsStoreFile['bySymbol'] {
  const out: Record<string, EarningsEvent[]> = {}
  const seen = new Set<string>()
  for (const [symbol, events] of Object.entries(existing)) {
    const kept = events.filter((e) => e.date >= retainFrom)
    if (kept.length > 0) out[symbol] = [...kept]
    for (const e of kept) seen.add(`${symbol}@${e.date}`)
  }
  for (const row of fetched) {
    if (row.date < retainFrom) continue
    const key = `${row.symbol}@${row.date}`
    if (seen.has(key)) continue
    seen.add(key)
    const { symbol, ...event } = row
    const list = out[symbol]
    if (list) list.push(event)
    else out[symbol] = [event]
  }
  for (const events of Object.values(out)) {
    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }
  return out
}

/**
 * Brings the store up to `to`. Cold start reaches back RETENTION_DAYS; an
 * incremental run refetches only the last OVERLAP_DAYS plus anything new.
 * A failed chunk keeps the store exactly as it was — freshness is the only
 * thing a provider outage may cost.
 */
export async function refreshEarningsStore(
  path: string,
  fmp: Fmp,
  to: string,
  log: (message: string) => void = () => {},
): Promise<EarningsStoreFile> {
  const existing = await readStore(path)
  const retainFrom = shiftDays(to, -RETENTION_DAYS)
  const from = existing
    ? laterOf(shiftDays(existing.fetchedTo, -OVERLAP_DAYS), retainFrom)
    : retainFrom

  const fetched: (EarningsEvent & { symbol: string })[] = []
  let chunkFrom = from
  try {
    while (chunkFrom <= to) {
      const chunkTo = earlierOf(shiftDays(chunkFrom, CHUNK_DAYS - 1), to)
      fetched.push(...(await fmp.earningsCalendar(chunkFrom, chunkTo)))
      chunkFrom = shiftDays(chunkTo, 1)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`  earnings calendar: ${message}; keeping the store as it was`)
    return existing ?? { fetchedTo: shiftDays(retainFrom, -1), bySymbol: {} }
  }

  const store: EarningsStoreFile = {
    fetchedTo: to,
    bySymbol: mergeCalendar(existing?.bySymbol ?? {}, fetched, retainFrom),
  }
  await writeStore(path, store)
  log(`  ${fetched.length} calendar rows fetched (${from} → ${to})`)
  return store
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const laterOf = (a: string, b: string) => (a > b ? a : b)
const earlierOf = (a: string, b: string) => (a < b ? a : b)
