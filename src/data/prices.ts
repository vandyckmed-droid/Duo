import {
  BENCHMARK_CLOSES,
  STOCK_CLOSES,
  TRADING_DATES,
} from './priceSeries.generated.ts'
import type { StockTicker } from './stocks.ts'
import type { PricePoint, StockPriceHistory } from './types.ts'

/**
 * Expands one column of the generated grid into a price history.
 *
 * Gaps (`null` cells) are skipped rather than filled, so the resulting
 * `points` contain only sessions this series actually traded — which is what
 * makes two series safe to align by date later.
 */
function toPriceHistory(
  closes: readonly (number | null)[],
): StockPriceHistory {
  const points: PricePoint[] = []

  for (const [index, adjustedClose] of closes.entries()) {
    if (adjustedClose !== null) {
      points.push({ date: TRADING_DATES[index], adjustedClose })
    }
  }

  return { points }
}

/**
 * Adjusted price history for every stock in the universe.
 *
 * `Object.fromEntries` widens its key type to `string`, so the result is
 * asserted back to a total record. The guarantee itself is not from this
 * assertion — it is from `STOCK_CLOSES` being declared
 * `satisfies Record<StockTicker, …>`, which already fails to compile if a
 * stock is missing.
 */
export const PRICE_HISTORY = Object.fromEntries(
  Object.entries(STOCK_CLOSES).map(([ticker, closes]) => [
    ticker,
    toPriceHistory(closes),
  ]),
) as Readonly<Record<StockTicker, StockPriceHistory>>

/** Adjusted price history for the market benchmark. */
export const BENCHMARK_HISTORY: StockPriceHistory =
  toPriceHistory(BENCHMARK_CLOSES)

/**
 * The most recent session in the dataset.
 *
 * Surfaced because a price app that does not say how current its prices are
 * is misleading, not minimal.
 */
export const LAST_TRADING_DATE: string = TRADING_DATES[TRADING_DATES.length - 1]
