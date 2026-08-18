/**
 * Metric-layer entry point.
 *
 * A metric is the "Variable" half of a Logo · Ticker · Variable card: a
 * named, formatted, rankable number derived from the calculation layer.
 */
import { twelveMonthReturnMetric } from './twelveMonthReturn.ts'
import type { Metric } from './types.ts'

export type { Metric, MetricContext, RankedStock } from './types.ts'
export { rankStocks, NO_VALUE } from './rank.ts'
export { formatPercent, formatRatio } from './format.ts'
export { twelveMonthReturnMetric } from './twelveMonthReturn.ts'
export { betaMetric } from './beta.ts'

/**
 * The variable currently on the cards.
 *
 * Deliberately a single constant rather than a selector, a route or a
 * setting. Changing what the product ranks by is a one-line edit here; when
 * it should become a user choice, this is the one place that has to learn
 * about state.
 */
export const ACTIVE_METRIC: Metric = twelveMonthReturnMetric
