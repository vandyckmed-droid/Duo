import type { Segment } from './segments.ts'
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
   * V2 path-quality facts (optional — absent in V1 datasets, so a V1 client
   * reading a V2 file and a V2 client reading a V1 file both keep working).
   *
   * These are per-security facts like everything else in this record; the
   * cross-sectional scores built from them (percentiles, agreement, Alpha
   * Score) are computed in the interface, where "a rank always means position
   * within the list you are looking at".
   */
  readonly path?: {
    /** Share of the trailing 252 trading days that closed up. */
    readonly positiveDayShare: number | null
    /** Share of the trailing year's log return earned on its 5 best days. */
    readonly top5Share: number | null
    /** Last price / trailing-252-day high, in (0, 1]. */
    readonly closeToHigh: number | null
    /** Share of the last 63 days spent within 5% of the running 252d high. */
    readonly timeNearHigh: number | null
    /** Annualised standard deviation of negative daily returns, 252d. */
    readonly downsideDeviation: number | null
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
