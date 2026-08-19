/**
 * Data layer entry point.
 *
 * Consumers import from `src/data` only, never from the individual modules,
 * so the generated dataset can be regenerated or re-sourced behind the same
 * surface.
 */
export type { Benchmark, PriceData, PriceSeries, Stock } from './types.ts'
export { UNIVERSE } from './universe.generated.ts'
export { loadPriceData, parsePriceData } from './loadPriceData.ts'
export { logoUrl } from './logo.ts'
