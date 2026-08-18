import type { Stock, StockPriceHistory } from '../data/types.ts'
import { calculateWindowReturn } from './windowReturn.ts'

/** A stock's ticker paired with its 12M raw return. */
export interface TwelveMonthReturn {
  readonly ticker: string
  readonly twelveMonthReturn: number | null
}

/**
 * 12M raw return for each given stock, derived from its price history.
 *
 * Takes the stock list and price history as arguments rather than importing
 * the dataset directly, so it works for the current 10-stock universe, a
 * test fixture, or a future larger universe without changes here.
 *
 * Sorted highest to lowest by return. Stocks with insufficient or unusable
 * history sort to the bottom, in their original relative order — every stock
 * passed in gets a row, none are dropped.
 */
export function calculateTwelveMonthReturns(
  stocks: readonly Stock[],
  priceHistory: Readonly<Record<string, StockPriceHistory>>,
): readonly TwelveMonthReturn[] {
  const returns = stocks.map((stock) => ({
    ticker: stock.ticker,
    twelveMonthReturn: calculateWindowReturn(
      priceHistory[stock.ticker]?.points ?? [],
    ),
  }))

  return [...returns].sort((a, b) => {
    if (a.twelveMonthReturn === null && b.twelveMonthReturn === null) {
      return 0
    }
    if (a.twelveMonthReturn === null) {
      return 1
    }
    if (b.twelveMonthReturn === null) {
      return -1
    }
    return b.twelveMonthReturn - a.twelveMonthReturn
  })
}
