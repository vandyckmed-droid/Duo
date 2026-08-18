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

/**
 * Ranks the universe by one metric, with every metric computed for display.
 *
 * All metrics are computed for every stock, not just the one being sorted
 * by, because each card shows the full set — the toggle only changes the
 * order and the emphasis, never what has to be recalculated.
 *
 * Stocks the metric cannot be computed for sort to the bottom in their
 * original order and carry `rank: null`. A recent listing has no twelve
 * months to measure; that is missing data, not last place, and ranking it
 * 400th would be a claim the data does not support.
 */
export function rankBy(
  stocks: readonly Stock[],
  priceData: PriceData,
  sortBy: Metric,
  metrics: readonly Metric[] = METRICS,
): readonly Ranked[] {
  const rows = stocks.map((stock) => {
    const series = priceData.series[stock.ticker]
    const values: Record<string, number | null> = {}
    for (const metric of metrics) {
      values[metric.id] = series ? metric.compute(series) : null
    }
    return { stock, values }
  })

  const sortable = rows.filter((row) => row.values[sortBy.id] !== null)
  const unrankable = rows.filter((row) => row.values[sortBy.id] === null)

  sortable.sort((a, b) => {
    const left = a.values[sortBy.id] as number
    const right = b.values[sortBy.id] as number
    return sortBy.direction === 'desc' ? right - left : left - right
  })

  return [
    ...sortable.map((row, index) => ({ ...row, rank: index + 1 })),
    ...unrankable.map((row) => ({ ...row, rank: null })),
  ]
}
