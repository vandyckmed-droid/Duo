import type { Stock } from '../data/types.ts'
import type { Metric, MetricContext, RankedStock } from './types.ts'

/** Shown in place of a value the data cannot support. */
export const NO_VALUE = '—'

/**
 * Ranks a universe by a metric.
 *
 * The single ranking path for the whole app. It is generic over the metric,
 * so this function is what makes the variable interchangeable — swapping
 * 12M return for volatility changes nothing here.
 *
 * Every stock passed in gets a row; none are dropped. Stocks the metric
 * could not value sort to the bottom in their original relative order,
 * because silently omitting them would misrepresent the universe, and
 * scattering them through the ranking would misrepresent the ordering.
 */
export function rankStocks(
  stocks: readonly Stock[],
  metric: Metric,
  context: MetricContext,
): readonly RankedStock[] {
  const valued = stocks.map((stock) => {
    const value = metric.compute(stock, context)

    return {
      stock,
      value,
      display: value === null ? NO_VALUE : metric.format(value),
    }
  })

  const direction = metric.order === 'ascending' ? -1 : 1

  return valued.sort((a, b) => {
    if (a.value === null || b.value === null) {
      return Number(a.value === null) - Number(b.value === null)
    }

    return direction * (b.value - a.value)
  })
}
