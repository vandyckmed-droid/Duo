import {
  calculateResidualReturn,
  calculateVolatility,
  calculateWindowedReturn,
  type MonthWindow,
} from '../calculations/index.ts'
import type { Metric } from './types.ts'

export type { Metric, MetricContext } from './types.ts'
export {
  computeMetricValues,
  metricHiddenWhenNarrow,
  rankValues,
  type Ranked,
} from './rank.ts'

/**
 * The shared lookback: twelve calendar months, skipping the most recent one.
 *
 * Skipping the last month is the "minus one" in 12–1. Momentum measured
 * right up to today is polluted by short-term reversal, so the convention is
 * to leave the freshest month out. Every metric uses this same window so the
 * numbers on a row describe the same stretch of history.
 */
export const MOMENTUM_WINDOW: MonthWindow = {
  fromMonthsAgo: 12,
  toMonthsAgo: 1,
}

/**
 * Percentage with precision that shrinks as the number grows.
 *
 * Three metric columns only fit a narrow phone if a value cannot outgrow six
 * characters, and a decimal place stops carrying information once a return is
 * in the hundreds of percent. Dropping it past 100% buys the width back
 * without a media query or a second formatter.
 */
function percent(value: number, signed: boolean): string {
  const scaled = value * 100
  const digits = Math.abs(scaled) >= 100 ? 0 : 1
  const sign = !signed ? '' : scaled > 0 ? '+' : scaled < 0 ? '−' : ''
  return `${sign}${Math.abs(scaled).toFixed(digits)}%`
}

const momentum: Metric = {
  id: 'momentum',
  label: '12–1 Momentum',
  shortLabel: '12–1',
  description:
    'Return over the twelve months ending one month ago, skipping the most recent month.',
  compute: (series) => calculateWindowedReturn(series, MOMENTUM_WINDOW),
  format: (value) => percent(value, true),
  direction: 'desc',
  signed: true,
}

const volatility: Metric = {
  id: 'volatility',
  label: 'Volatility',
  shortLabel: 'VOL',
  description:
    'Annualized standard deviation of daily returns over the same window.',
  compute: (series) => calculateVolatility(series, MOMENTUM_WINDOW),
  format: (value) => percent(value, false),
  direction: 'asc',
  signed: false,
}

const residual: Metric = {
  id: 'residual',
  label: 'Residual Return',
  shortLabel: 'RESID',
  description:
    'Return over the same window with the midcap market’s move removed, scaled by the stock’s three-year beta to IJH.',
  compute: (series, context) =>
    calculateResidualReturn(series, context.benchmark.series, MOMENTUM_WINDOW),
  format: (value) => percent(value, true),
  direction: 'desc',
  signed: true,
}

/**
 * Every metric the app can rank by, in toggle order.
 *
 * Order here is the order of the toggle and of the columns on a row.
 */
export const METRICS: readonly Metric[] = [momentum, volatility, residual]

export const DEFAULT_METRIC_ID = momentum.id

/** Looks a metric up by id, falling back to the default for anything unknown. */
export function metricById(id: string | null | undefined): Metric {
  return METRICS.find((metric) => metric.id === id) ?? METRICS[0]
}
