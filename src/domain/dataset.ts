import type { Segment } from './segments.ts'
import type { MarketRegime } from './regime.ts'
import type { VolatilityWindowId, WindowId } from './windows.ts'

/**
 * The published dataset: the contract between the build pipeline and the
 * interface.
 *
 * The interface knows this shape and nothing else. It has never heard of
 * Financial Modeling Prep, and swapping the provider changes only the code
 * that produces these files.
 *
 * The split is deliberate. `universe.json` holds every number the ranked list
 * needs and is the single request made at startup, so the list can render
 * before anything else loads. Price series are one file per ticker, fetched
 * only when a chart or a portfolio actually needs them — a phone should not
 * download three years of daily closes for 1,500 names to sort a list.
 */

export const DATASET_VERSION = 3

/** Numbers keyed by window. `null` means genuinely unavailable, never zero. */
export type ByWindow = Partial<Record<WindowId, number | null>>
export type ByVolatilityWindow = Partial<Record<VolatilityWindowId, number | null>>

export interface SecurityRecord {
  readonly ticker: string
  readonly name: string
  readonly segment: Segment
  /** The segment's benchmark ETF. Stored per security so a row can name it. */
  readonly benchmark: string
  readonly sector: string
  readonly industry: string
  readonly marketCap: number | null

  readonly returns: ByWindow
  readonly residuals: ByWindow
  /**
   * Annualised volatility of daily residuals over the 12−1 window (optional —
   * absent in older datasets). The denominator of residual-per-volatility.
   */
  readonly residualVol?: number | null
  /**
   * Volatility over each ranking window's formation span (optional): raw
   * daily returns and daily residuals respectively, annualised. The ÷ Vol
   * ranking dimension divides a window's return by the matching entry, so
   * numerator and denominator always cover the same days and the same series.
   */
  readonly rankVol?: ByWindow
  readonly rankResidualVol?: ByWindow
  readonly volatility: ByVolatilityWindow
  /** 12-month return divided by 1-year annualised volatility. */
  readonly returnPerVol: number | null
  /** Deepest peak-to-trough fall over the trailing year, negative. */
  readonly maxDrawdown: number | null

  readonly beta: number | null
  /** Share of the stock's variance the benchmark explains. */
  readonly betaR2: number | null
  readonly betaObservations: number

  readonly last: number | null
  readonly lastDate: string | null
  readonly low52: number | null
  readonly high52: number | null

  /**
   * The latest earnings announcement within the last 63 trading days
   * (optional — absent when there is none, or in older datasets).
   * `surprise` is actual minus estimated EPS as a share of the
   * announcement-day close; `sinceReturn` is the return from the
   * announcement's trading day to the as-of date.
   */
  readonly earnings?: {
    readonly date: string
    readonly epsActual: number | null
    readonly epsEstimated: number | null
    readonly surprise: number | null
    readonly sinceReturn: number | null
  }

  /** Usable observations held for this security, and their span. */
  readonly history: { days: number; from: string | null; to: string | null }

  /**
   * The same metrics evaluated 63 trading days earlier, from the cached
   * history. Rank change is the difference between rankings built from
   * `returns` and from `prior.returns` — no rank is ever stored, so a rank
   * always means "position within the list you are looking at".
   */
  readonly prior: {
    readonly returns: ByWindow
    readonly residuals: ByWindow
    readonly volatility: ByVolatilityWindow
    readonly returnPerVol: number | null
    readonly marketCap: number | null
  }

  /** Set when the provider returned nothing new this run. */
  readonly stale?: boolean
}

export interface Provenance {
  readonly segment: Segment
  /** Where membership came from, e.g. `fmp:sp500-constituent`. */
  readonly source: string
  readonly detail: string
  readonly count: number
}

export interface Manifest {
  readonly version: number
  readonly generatedAt: string
  /** Last trading day in the dataset. */
  readonly asOf: string
  readonly provider: string
  readonly benchmarks: Record<Segment, string>
  readonly membership: readonly Provenance[]
  readonly counts: { total: number } & Partial<Record<Segment, number>>
  readonly calendarDays: number
  readonly windows: Record<string, { formation: number; skip: number }>
  readonly betaLookback: number
  readonly rankChangeOffset: number
  /** Names dropped this run and why, so thin coverage is explainable. */
  readonly excluded: readonly { ticker: string; reason: string }[]
  /**
   * The market momentum regime at the dataset's as-of date (optional —
   * absent in older datasets, and either side of the contract works
   * without the other).
   */
  readonly market?: MarketRegime
}

export interface UniverseFile {
  readonly version: number
  readonly asOf: string
  readonly securities: readonly SecurityRecord[]
}

/** One ticker's adjusted closes, fetched on demand for charts and portfolios. */
export interface SeriesFile {
  readonly ticker: string
  readonly dates: readonly string[]
  readonly closes: readonly (number | null)[]
}
