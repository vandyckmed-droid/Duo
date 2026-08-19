import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pooled, type EarningsEvent, type Fmp } from '../pipeline/fmp.ts'

/**
 * The Lab's earnings store: one file per ticker of announcement-dated
 * events, refreshed at most once per day per ticker, merged so history is
 * never lost to a failed request. Lab-side only — production ingests no
 * fundamental data until a fundamental signal earns promotion, per the
 * directive's rule that every field must exist because a defined signal
 * uses it.
 */

export interface CachedEarnings {
  readonly ticker: string
  /** ISO date of the last successful provider response. */
  readonly refreshedAt: string
  readonly events: EarningsEvent[]
}

export class EarningsCache {
  private readonly directory: string

  constructor(directory: string) {
    this.directory = directory
  }

  private path(ticker: string): string {
    return join(this.directory, `${encodeURIComponent(ticker)}.json`)
  }

  async ensure(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
  }

  async read(ticker: string): Promise<CachedEarnings | null> {
    try {
      const raw = await readFile(this.path(ticker), 'utf8')
      const parsed = JSON.parse(raw) as CachedEarnings
      if (!Array.isArray(parsed?.events)) return null
      return parsed
    } catch {
      return null
    }
  }

  async write(series: CachedEarnings): Promise<void> {
    await writeFile(this.path(series.ticker), JSON.stringify(series))
  }
}

/** Merge by announcement date; fresh rows win, absent rows are kept. */
export function mergeEvents(
  cached: readonly EarningsEvent[],
  fetched: readonly EarningsEvent[],
): EarningsEvent[] {
  const byDate = new Map<string, EarningsEvent>()
  for (const e of cached) byDate.set(e.date, e)
  for (const e of fetched) byDate.set(e.date, e)
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * Brings every ticker's announcements up to date. A ticker already refreshed
 * today is skipped — announcements are quarterly, and re-fetching 1,500
 * unchanged histories every run would spend the key on nothing.
 */
export async function refreshEarnings(
  cache: EarningsCache,
  fmp: Fmp,
  tickers: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, readonly EarningsEvent[]>> {
  await cache.ensure()
  const today = new Date().toISOString().slice(0, 10)
  let done = 0

  const results = await pooled(tickers, fmp.concurrency, async (ticker) => {
    const existing = await cache.read(ticker)
    if (existing && existing.refreshedAt === today) {
      onProgress?.(++done, tickers.length)
      return [ticker, existing.events] as const
    }
    try {
      const fetched = await fmp.earnings(ticker)
      const merged = mergeEvents(existing?.events ?? [], fetched)
      await cache.write({ ticker, refreshedAt: today, events: merged })
      return [ticker, merged] as const
    } catch {
      // The cached history stays exactly as it was; a provider failure costs
      // freshness, never data.
      return [ticker, existing?.events ?? []] as const
    } finally {
      onProgress?.(++done, tickers.length)
    }
  })

  return new Map(results)
}
