import type { Stock } from './types.ts'

/**
 * The stock universe.
 *
 * Ten entries today; the array is the only thing that grows when the universe
 * becomes 20, 100 or 1000. Nothing downstream is indexed by position or by a
 * hardcoded ticker.
 */
export const STOCKS = [
  { ticker: 'AAPL', name: 'Apple', logo: 'apple.com' },
  { ticker: 'MSFT', name: 'Microsoft', logo: 'microsoft.com' },
  { ticker: 'NVDA', name: 'NVIDIA', logo: 'nvidia.com' },
  { ticker: 'AMZN', name: 'Amazon', logo: 'amazon.com' },
  { ticker: 'GOOGL', name: 'Alphabet', logo: 'abc.xyz' },
  { ticker: 'META', name: 'Meta Platforms', logo: 'meta.com' },
  { ticker: 'TSLA', name: 'Tesla', logo: 'tesla.com' },
  { ticker: 'JPM', name: 'JPMorgan Chase', logo: 'jpmorganchase.com' },
  { ticker: 'XOM', name: 'Exxon Mobil', logo: 'exxonmobil.com' },
  { ticker: 'WMT', name: 'Walmart', logo: 'walmart.com' },
] as const satisfies readonly Stock[]

/**
 * Union of the tickers actually present in the universe.
 *
 * Derived from the data, never written by hand, so adding a stock above
 * automatically widens it — and makes the price history record below fail to
 * compile until that stock's history exists.
 */
export type StockTicker = (typeof STOCKS)[number]['ticker']
