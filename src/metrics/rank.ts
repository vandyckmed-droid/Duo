import type { PriceData, Stock } from '../data/types.ts'
import { METRICS } from './index.ts'
import type { Metric } from './types.ts'

/** A stock with every metric computed, plus its position in the ranking. */
export interface Ranked {
  readonly rank: number | null
  readonly stock: Stock
  /** Every metric's value by id; `null` where the series cannot support it. */
  readonly values: Readonly<Record<string, number | null>>
}

/** A stock's computed metric values, before any ordering is applied. */
export type MetricValues = Omit<Ranked, 'rank'>

/**
 * Computes every metric for every stock.
 *
 * Split from the sort because the values depend only on the data, never on
 * which metric is active: fitting a regression per stock is real work, and
 * redoing it each time the toggle moves would pay that cost to produce the
 * numbers already on screen.
 *
 * A stock with no price history gets null values rather than being dropped —
 * it is still a constituent.
 */
export function computeMetricValues(
  stocks: readonly Stock[],
  priceData: PriceData,
  metrics: readonly Metric[] = METRICS,
): readonly MetricValues[] {
  const context = { benchmark: priceData.benchmark }

  return stocks.map((stock) => {
    const series = priceData.series[stock.ticker]
    const values: Record<string, number | null> = {}
    for (const metric of metrics) {
      values[metric.id] = series ? metric.compute(series, context) : null
    }
    return { stock, values }
  })
}

/**
 * Orders precomputed values by one metric.
 *
 * Stocks the metric cannot be computed for sort to the bottom in their
 * original order and carry `rank: null`. A recent listing has no twelve
 * months to measure; that is missing data, not last place, and ranking it
 * 400th would be a claim the data does not support.
 */
export function rankValues(
  values: readonly MetricValues[],
  sortBy: Metric,
): readonly Ranked[] {
  const sortable = values.filter((row) => row.values[sortBy.id] !== null)
  const unrankable = values.filter((row) => row.values[sortBy.id] === null)

  const ordered = [...sortable].sort((a, b) => {
    const left = a.values[sortBy.id] as number
    const right = b.values[sortBy.id] as number
    return sortBy.direction === 'desc' ? right - left : left - right
  })

  return [
    ...ordered.map((row, index) => ({ ...row, rank: index + 1 })),
    ...unrankable.map((row) => ({ ...row, rank: null })),
  ]
}

/**
 * The metric to drop when there is only room for two value columns.
 *
 * The active metric must stay, so the last of the others in registry order
 * gives way. Header and rows both read this, so the column that disappears
 * is the same one in each.
 */
export function metricHiddenWhenNarrow(
  metrics: readonly Metric[],
  activeId: string,
): string | null {
  const inactive = metrics.filter((metric) => metric.id !== activeId)
  return inactive.length > 1 ? (inactive.at(-1)?.id ?? null) : null
}
