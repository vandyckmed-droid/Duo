import {
  calculateVolatility,
  calculateWindowedReturn,
  type MonthWindow,
} from '../calculations/index.ts'
import type { Metric } from './types.ts'

export type { Metric } from './types.ts'
export { rankBy, type Ranked } from './rank.ts'

/**
 * The shared lookback: twelve calendar months, skipping the most recent one.
 *
 * Skipping the last month is the "minus one" in 12–1. Momentum measured
 * right up to today is polluted by short-term reversal, so the convention is
 * to leave the freshest month out. Volatility uses the same window so the
 * two numbers on a card describe the same stretch of history.
 */
export const MOMENTUM_WINDOW: MonthWindow = {
  fromMonthsAgo: 12,
  toMonthsAgo: 1,
}

const percent = (value: number): string =>
  `${(value * 100).toFixed(1)}%`

const signedPercent = (value: number): string =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${(Math.abs(value) * 100).toFixed(1)}%`

const momentum: Metric = {
  id: 'momentum',
  label: '12–1 Momentum',
  shortLabel: '12–1',
  description:
    'Return over the twelve months ending one month ago, skipping the most recent month.',
  compute: (series) => calculateWindowedReturn(series, MOMENTUM_WINDOW),
  format: signedPercent,
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
  format: percent,
  direction: 'asc',
  signed: false,
}

/**
 * Every metric the app can rank by, in toggle order.
 *
 * Order here is the order of the toggle and of the columns on a card.
 */
export const METRICS: readonly Metric[] = [momentum, volatility]

export const DEFAULT_METRIC_ID = momentum.id

/** Looks a metric up by id, falling back to the default for anything unknown. */
export function metricById(id: string | null | undefined): Metric {
  return METRICS.find((metric) => metric.id === id) ?? METRICS[0]
}
