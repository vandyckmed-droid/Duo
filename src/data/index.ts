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
export { BENCHMARK } from './benchmark.ts'
export { BENCHMARK_HISTORY, LAST_TRADING_DATE, PRICE_HISTORY } from './prices.ts'
export { PRICE_SERIES_META } from './priceSeries.generated.ts'
