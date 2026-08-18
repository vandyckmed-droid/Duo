import type { Stock } from './types.ts'

/**
 * The market benchmark every stock is measured against.
 *
 * Deliberately a `Stock` like any other rather than a special case: it has a
 * ticker, a name and a logo, and its price history is fetched, aligned and
 * validated by exactly the same code path as the universe. That is what lets
 * the benchmark be swapped (SPY → an equal-weight ETF, a sector ETF, a
 * custom index) without any calculation knowing it changed.
 *
 * It is kept out of `STOCKS` because it is not a card — it is the reference
 * the cards are ranked relative to.
 */
export const BENCHMARK = {
  ticker: 'SPY',
  name: 'SPDR S&P 500 ETF Trust',
  logo: 'ssga.com',
} as const satisfies Stock
