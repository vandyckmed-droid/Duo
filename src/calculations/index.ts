/**
 * Calculation-layer entry point.
 *
 * Pure, framework-free functions derived from price data. Consumers import
 * from `src/calculations` only, never from the individual modules.
 *
 * Nothing here knows what a card is or which variable is on screen — these
 * are the primitives that named, rankable metrics in `src/metrics` are
 * composed from.
 */
export { calculateRawReturn } from './rawReturn.ts'
export { calculateTrailingTwelveMonthReturn } from './trailingTwelveMonthReturn.ts'
export { toObservations } from './observations.ts'
export { calculateAlignedReturns } from './alignedReturns.ts'
export type { ReturnPair } from './alignedReturns.ts'
export { fitLine } from './linearRegression.ts'
export type { LinearFit } from './linearRegression.ts'
export {
  estimateMarketModel,
  MINIMUM_MARKET_MODEL_PERIODS,
} from './marketModel.ts'
export type { MarketModel } from './marketModel.ts'
