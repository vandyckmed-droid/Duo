import type { Stock, StockPriceHistory } from '../data/types.ts'

/**
 * Everything a metric is allowed to read.
 *
 * Passed in rather than imported, so a metric is a pure function of its
 * inputs: the same metric runs against the real dataset, a test fixture, or
 * a future remote source with no change. The benchmark is here from the
 * start even though the first metric ignores it — a market-relative variable
 * is the obvious second one, and widening this contract later would mean
 * touching every metric that already exists.
 */
export interface MetricContext {
  /** Price history by ticker. */
  readonly priceHistory: Readonly<Record<string, StockPriceHistory>>
  /** Price history of the market benchmark. */
  readonly benchmarkHistory: StockPriceHistory
}

/**
 * The variable on a card.
 *
 * This is the seam the product is built around: a card is
 * Logo · Ticker · Variable, and *which* variable is a value, not a code
 * path. Replacing 12M return with volatility, beta, rank change or market
 * cap means writing one object that satisfies this interface and pointing
 * `ACTIVE_METRIC` at it. No ranking code, no component and no data module
 * changes.
 *
 * A metric owns three things and nothing else: how to compute its number,
 * how to render it, and which end of the scale ranks first.
 */
export interface Metric {
  /** Stable identifier, safe to persist in a URL or a preference later. */
  readonly id: string
  /** Short label for the variable, shown alongside the ranked cards. */
  readonly label: string
  /** Which end of the scale ranks first. */
  readonly order: 'descending' | 'ascending'
  /**
   * The stock's value for this metric, or `null` when the data cannot
   * support one. `null` is a first-class answer, not an error: a stock with
   * too little history still gets a card, it just does not get a number.
   */
  compute(stock: Stock, context: MetricContext): number | null
  /** Renders a computed value for display. */
  format(value: number): string
}

/** A stock paired with its value for the metric it was ranked by. */
export interface RankedStock {
  readonly stock: Stock
  /** The raw value, kept so callers can compare or re-rank without reparsing. */
  readonly value: number | null
  /** The value as shown on the card. */
  readonly display: string
}
