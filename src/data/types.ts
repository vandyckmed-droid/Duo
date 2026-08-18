/**
 * Stock data contract.
 *
 * Identity (`Stock`) is kept separate from price history (`StockPriceHistory`)
 * and the two are joined by `ticker`. Identity is small, stable and always
 * needed; history is large, refreshed on a different cadence and will later be
 * fetched per ticker. Keeping them apart means a remote price source can
 * replace the static history without touching identity, and vice versa.
 */

/**
 * A logo reference, not a URL. The presentation layer resolves it to an image
 * source, so the resolution strategy can change without touching the dataset.
 * Currently the company's primary domain.
 */
export type LogoRef = string

/** Static identity of a stock. */
export interface Stock {
  /** Uppercase exchange ticker. Primary key across the data layer. */
  readonly ticker: string
  /** Display name of the company. */
  readonly name: string
  /** Reference used to resolve the company logo. */
  readonly logo: LogoRef
}

/** A single observation of a stock's adjusted price. */
export interface PricePoint {
  /** ISO 8601 calendar date (YYYY-MM-DD) of the observation. */
  readonly date: string
  /** Split- and dividend-adjusted close, in the stock's listing currency. */
  readonly adjustedClose: number
}

/**
 * Adjusted price history for one stock.
 *
 * `points` are ordered oldest to newest and span at least 12 months, which is
 * what a 12M raw return needs. Consumers derive returns from these points;
 * no computed return is stored.
 */
export interface StockPriceHistory {
  readonly ticker: string
  readonly points: readonly PricePoint[]
}
