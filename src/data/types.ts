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

/** A single dated point in a stock's adjusted price series. */
export interface PricePoint {
  /** ISO 8601 calendar date (YYYY-MM-DD) the price is anchored to. */
  readonly date: string
  /** Split- and dividend-adjusted close, in the stock's listing currency. */
  readonly adjustedClose: number
}

/**
 * Adjusted price history for one stock.
 *
 * `points` span at least 12 months, which is what a 12M raw return needs.
 * Consumers derive returns from these points; no computed return is stored.
 *
 * This dataset happens to list points oldest to newest, but that is a
 * property of the data, not a contract: the calculation layer selects
 * points by comparing their dates, never by position, so a feed that
 * returns newest-first needs no reordering.
 *
 * The stock this belongs to is carried by the key of the record holding it, so
 * the history itself does not repeat the ticker — there is nothing that can
 * disagree with the key.
 */
export interface StockPriceHistory {
  readonly points: readonly PricePoint[]
}
