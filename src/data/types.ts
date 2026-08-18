/**
 * Stock data contract.
 *
 * Identity (`Stock`) is kept separate from price history (`PriceSeries`) and
 * the two are joined by `ticker`. Identity is small, stable and always
 * needed; history is large, refreshed on a different cadence, and ships as a
 * separately cacheable asset. Keeping them apart means the price source can
 * be replaced without touching identity, and vice versa.
 */

/** Static identity of a stock. */
export interface Stock {
  /** Uppercase exchange ticker. Primary key across the data layer. */
  readonly ticker: string
  /** Display name of the company. */
  readonly name: string
  /** GICS sector, as classified by the index. */
  readonly sector: string
}

/**
 * Adjusted daily closes for one stock, aligned to a shared trading-day index.
 *
 * Columnar rather than an array of dated objects: every series shares one
 * `timestamps` array, so the calendar is parsed once for the whole universe
 * instead of once per stock per day. Across 400 stocks and three years that
 * is the difference between hundreds of thousands of allocations and a few
 * hundred — the reason a phone can rank the whole index without stuttering.
 *
 * `closes[i]` is the dividend-adjusted close on `timestamps[i]`, or `null`
 * where the stock had no listing or no usable print that day (a recent IPO
 * has nulls across its pre-listing history).
 */
export interface PriceSeries {
  /** Shared, strictly ascending UTC timestamps. */
  readonly timestamps: readonly number[]
  /** Adjusted closes aligned to `timestamps`; `null` where unavailable. */
  readonly closes: readonly (number | null)[]
}

/** The whole universe's price history, keyed by ticker. */
export interface PriceData {
  /** ISO date the dataset was generated. */
  readonly generatedAt: string
  /** Shared, strictly ascending UTC timestamps for every series. */
  readonly timestamps: readonly number[]
  /** Series by ticker. Absent tickers simply have no history. */
  readonly series: Readonly<Record<string, PriceSeries>>
  /**
   * The market surrogate the universe is measured against.
   *
   * Held outside `series` on purpose: it shares the calendar and the shape of
   * a constituent, so keeping it in the same map would make it one bad
   * iteration away from being ranked as a stock.
   */
  readonly benchmark: Benchmark
}

/** A market surrogate: an identified series that is not a constituent. */
export interface Benchmark {
  /** Ticker of the instrument standing in for the market. */
  readonly ticker: string
  /** Its price series, on the shared calendar. */
  readonly series: PriceSeries
}
