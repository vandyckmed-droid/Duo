/**
 * The Financial Modeling Prep client.
 *
 * This is the only module in the repository that reads the API key, and the
 * whole pipeline is the only thing that runs it — inside GitHub Actions, never
 * in the browser. The key comes from the environment, is never written to a
 * file, never appears in a log line, and never reaches the published dataset.
 * The client bundle has no code path that can talk to a provider at all.
 *
 * Everything above this file speaks in canonical securities and price series.
 * Replacing FMP means rewriting this module and nothing else.
 */

const BASE = 'https://financialmodelingprep.com/stable'

/**
 * The environment variables the key may arrive under, in order of preference.
 *
 * `FMP_API_KEY` names the provider and is what the documentation says to set.
 * `API_KEY` is the name the credential is already configured under in this
 * repository's environment, and renaming a working secret is a worse trade
 * than reading two names.
 */
export const KEY_VARIABLES = ['FMP_API_KEY', 'API_KEY'] as const

/**
 * Reads the key from the environment.
 *
 * Returns the value only — never which variable it came from, and never any
 * part of the key itself — so nothing a caller logs can narrow it down.
 */
export function readApiKey(env: Record<string, string | undefined>): string {
  for (const name of KEY_VARIABLES) {
    const value = env[name]?.trim()
    if (value) return value
  }
  return ''
}

export interface ClientOptions {
  /** Requests in flight at once. */
  readonly concurrency?: number
  readonly retries?: number
  /** Floor on the gap between request starts, in milliseconds. */
  readonly minIntervalMs?: number
}

export class FmpError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'FmpError'
    this.status = status
  }
}

export interface Quote {
  readonly symbol: string
  readonly name: string | null
  readonly price: number | null
  readonly marketCap: number | null
  readonly exchange: string | null
  readonly yearLow: number | null
  readonly yearHigh: number | null
}

export interface PricePoint {
  readonly date: string
  readonly close: number
}

export interface Constituent {
  readonly symbol: string
  readonly name: string
  readonly sector: string
  readonly industry: string
}

/**
 * One earnings announcement. `date` is the announcement date — the day the
 * numbers became public information — which is what makes point-in-time use
 * possible. Estimates are the consensus as it stood at announcement; either
 * side may be absent for small names.
 */
export interface EarningsEvent {
  readonly date: string
  readonly epsActual: number | null
  readonly epsEstimated: number | null
  readonly revenueActual: number | null
  readonly revenueEstimated: number | null
}

export class Fmp {
  private readonly key: string
  readonly concurrency: number
  private readonly retries: number
  private calls = 0
  /**
   * Shared, self-tuning rate control.
   *
   * A 429 is a statement about the whole API key, not about the one request
   * that happened to receive it. Backing off only that request leaves every
   * other worker hammering the same limit, and the resulting burst of refusals
   * walks straight through all four retries of whatever tickers are in flight
   * — which is how a run silently loses thirty alphabetically-adjacent names.
   *
   * So two shared mechanisms, both spanning every worker:
   *
   *  - A **pacer**: requests start at least `interval` apart. The provider's
   *    published limit depends on the plan, so rather than hard-coding a
   *    number the client starts brisk and slows down when told to.
   *  - A **gate**: a 429 parks every worker until the same moment, and halves
   *    the pace. The interval recovers gradually once requests are landing
   *    again, so one bad minute does not slow the rest of the run to a crawl.
   */
  private openAt = 0
  private nextSlot = 0
  private interval: number
  private readonly minInterval: number
  private readonly maxInterval = 400
  private throttles = 0

  constructor(key: string, options: ClientOptions = {}) {
    if (!key) {
      throw new FmpError(
        `No API key in the environment. Set one of ${KEY_VARIABLES.join(' or ')}; the pipeline reads it from the environment and it is never stored in the repository.`,
      )
    }
    this.key = key
    this.concurrency = options.concurrency ?? 8
    this.retries = options.retries ?? 6
    this.minInterval = options.minIntervalMs ?? 12
    this.interval = this.minInterval
  }

  /** Requests issued so far, for the run summary. */
  get requestCount(): number {
    return this.calls
  }

  /** Times the provider asked the whole client to slow down. */
  get throttleCount(): number {
    return this.throttles
  }

  /** Waits for the gate to open, then claims the next pacing slot. */
  private async takeSlot(): Promise<void> {
    for (;;) {
      const now = Date.now()
      if (this.openAt > now) {
        await sleep(Math.min(1000, this.openAt - now))
        continue
      }
      const slot = Math.max(now, this.nextSlot)
      this.nextSlot = slot + this.interval
      const delay = slot - now
      if (delay > 0) await sleep(delay)
      // The gate may have closed while this worker was waiting for its slot.
      if (this.openAt <= Date.now()) return
    }
  }

  private closeGate(ms: number): void {
    this.throttles++
    this.openAt = Math.max(this.openAt, Date.now() + ms)
    this.interval = Math.min(this.maxInterval, Math.max(this.minInterval, this.interval * 2))
    this.nextSlot = this.openAt
  }

  /** Eases the pace back after a clean request. */
  private relax(): void {
    if (this.interval > this.minInterval) {
      this.interval = Math.max(this.minInterval, this.interval * 0.98)
    }
  }

  /**
   * One GET, with backoff.
   *
   * 429 backs off and retries — the provider is asking for patience, not
   * refusing. 402 does not: a restricted endpoint will still be restricted on
   * the fourth attempt, and retrying only makes the failure slower.
   */
  private async get(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${BASE}/${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('apikey', this.key)

    let lastError: unknown = new FmpError(`${path}: rate limited after ${this.retries} attempts`, 429)
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      await this.takeSlot()
      try {
        this.calls++
        const response = await fetch(url)
        if (response.status === 429) {
          this.closeGate(2000 * attempt)
          continue
        }
        if (response.status === 402) {
          throw new FmpError(`${path}: not available on this subscription`, 402)
        }
        if (!response.ok) throw new FmpError(`${path}: HTTP ${response.status}`, response.status)
        const body = await response.json()
        this.relax()
        return body
      } catch (error) {
        // The message is built from the path and status only. Interpolating the
        // URL would put the key into the run log.
        if (error instanceof FmpError && error.status === 402) throw error
        lastError = error
        if (attempt < this.retries) await sleep(800 * attempt)
      }
    }
    throw lastError instanceof Error ? lastError : new FmpError(`${path}: failed`)
  }

  /** Whether an endpoint is reachable on this subscription. */
  async probe(path: string, params: Record<string, string> = {}): Promise<boolean> {
    try {
      const body = await this.get(path, params)
      return Array.isArray(body) ? body.length > 0 : body !== null
    } catch {
      return false
    }
  }

  /** S&P 500 constituents, with GICS sector and sub-industry. */
  async sp500Constituents(): Promise<Constituent[]> {
    const body = await this.get('sp500-constituent')
    if (!Array.isArray(body)) throw new FmpError('sp500-constituent: unexpected payload')
    return body
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map((row) => ({
        symbol: String(row['symbol'] ?? '').trim(),
        name: String(row['name'] ?? '').trim(),
        sector: String(row['sector'] ?? '').trim(),
        industry: String(row['subSector'] ?? '').trim(),
      }))
      .filter((c) => c.symbol.length > 0)
  }

  /**
   * ETF holdings, used to derive membership for segments the provider has no
   * constituent endpoint for. Returns `null` when the subscription does not
   * include it, so the caller can fall back rather than fail the run.
   */
  async etfHoldings(symbol: string): Promise<string[] | null> {
    try {
      const body = await this.get('etf/holdings', { symbol })
      if (!Array.isArray(body)) return null
      const symbols = body
        .map((row) => (row && typeof row === 'object' ? String((row as Record<string, unknown>)['asset'] ?? (row as Record<string, unknown>)['symbol'] ?? '') : ''))
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      return symbols.length > 0 ? symbols : null
    } catch {
      return null
    }
  }

  /** Quotes in batches, for market cap and the 52-week range. */
  async quotes(symbols: readonly string[], batchSize = 200): Promise<Map<string, Quote>> {
    const out = new Map<string, Quote>()
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize)
      const body = await this.get('batch-quote', { symbols: batch.join(',') })
      if (!Array.isArray(body)) continue
      for (const row of body) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        const symbol = String(r['symbol'] ?? '')
        if (!symbol) continue
        out.set(symbol, {
          symbol,
          name: str(r['name']),
          price: num(r['price']),
          marketCap: num(r['marketCap']),
          exchange: str(r['exchange']),
          yearLow: num(r['yearLow']),
          yearHigh: num(r['yearHigh']),
        })
      }
    }
    return out
  }

  /**
   * Dividend-adjusted end-of-day closes, oldest first.
   *
   * Adjusted rather than raw: a two-for-one split halves the raw close and
   * would show up as a −50% day in every return and a spike in every
   * volatility estimate. Only finite, strictly positive closes are kept, and
   * duplicate dates collapse to the last one the provider sent.
   */
  async adjustedCloses(symbol: string, from: string, to: string): Promise<PricePoint[]> {
    const body = await this.get('historical-price-eod/dividend-adjusted', { symbol, from, to })
    if (!Array.isArray(body)) throw new FmpError(`${symbol}: unexpected payload`)

    const byDate = new Map<string, number>()
    for (const row of body) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const date = String(r['date'] ?? '').slice(0, 10)
      const close = num(r['adjClose'])
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      if (close === null || close <= 0) continue
      byDate.set(date, close)
    }
    return [...byDate]
      .map(([date, close]) => ({ date, close }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }

  /**
   * Earnings announcements for one symbol, oldest first. One announcement per
   * date — the provider occasionally repeats a row, and keeping the last
   * occurrence matches how it orders corrections.
   */
  async earnings(symbol: string, limit = 80): Promise<EarningsEvent[]> {
    const body = await this.get('earnings', { symbol, limit: String(limit) })
    if (!Array.isArray(body)) throw new FmpError(`${symbol}: unexpected payload`)

    const byDate = new Map<string, EarningsEvent>()
    for (const row of body) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const date = String(r['date'] ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      byDate.set(date, {
        date,
        epsActual: num(r['epsActual']),
        epsEstimated: num(r['epsEstimated']),
        revenueActual: num(r['revenueActual']),
        revenueEstimated: num(r['revenueEstimated']),
      })
    }
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Runs `worker` over `items` with a bounded number in flight. */
export async function pooled<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await worker(items[i] as T, i)
      }
    }),
  )
  return results
}
