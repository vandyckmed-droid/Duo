/**
 * Calculation-layer entry point.
 *
 * Pure, framework-free functions derived from price data. Consumers import
 * from `src/calculations` only, never from the individual modules.
 */
export { calculateRawReturn } from './rawReturn.ts'
export { calculateTrailingTwelveMonthReturn } from './trailingTwelveMonthReturn.ts'
export { calculateTwelveMonthReturns } from './twelveMonthReturns.ts'
export type { TwelveMonthReturn } from './twelveMonthReturns.ts'
