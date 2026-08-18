/**
 * Data layer entry point.
 *
 * Consumers import from `src/data` only, never from the individual modules, so
 * the static dataset can later be swapped for a remote source behind the same
 * surface.
 */
export type { LogoRef, PricePoint, Stock, StockPriceHistory } from './types.ts'
export { STOCKS } from './stocks.ts'
export type { StockTicker } from './stocks.ts'
export { PRICE_HISTORY } from './prices.ts'
