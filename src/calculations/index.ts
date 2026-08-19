/**
 * Calculation-layer entry point.
 *
 * Pure, framework-free functions derived from price data. Consumers import
 * from `src/calculations` only, never from the individual modules.
 */
export { calculateRawReturn } from './rawReturn.ts'
export { parseIsoDateToUtc } from './isoDate.ts'
export { subtractCalendarMonths } from './calendar.ts'
export {
  closeAtOrBefore,
  indexAtOrBefore,
  lastUsableIndex,
} from './seriesLookup.ts'
export { calculateWindowedReturn, resolveWindow } from './windowedReturn.ts'
export type { MonthWindow, ResolvedWindow } from './windowedReturn.ts'
export {
  calculateVolatility,
  dailyReturnsBetween,
  standardDeviation,
  TRADING_DAYS_PER_YEAR,
} from './volatility.ts'
export {
  alignedDailyReturns,
  calculateResidualReturn,
  estimateBeta,
} from './marketModel.ts'
export type { AlignedReturns } from './marketModel.ts'
