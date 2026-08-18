import { estimateMarketModel } from '../calculations/index.ts'
import { formatRatio } from './format.ts'
import type { Metric } from './types.ts'

/**
 * Market beta against the benchmark, over the full available history.
 *
 * Not the variable on the cards today. It exists because a seam that has
 * only ever had one thing plugged into it is a guess, not a seam — this is
 * the second metric that proves the first one generalised. It is also the
 * one that exercises `MetricContext.benchmarkHistory`, which the launch
 * variable never touches.
 *
 * Swapping the app to rank by beta is a one-line change to `ACTIVE_METRIC`.
 */
export const betaMetric: Metric = {
  id: 'beta',
  label: 'Beta',
  order: 'descending',

  compute(stock, context) {
    const model = estimateMarketModel(
      context.priceHistory[stock.ticker]?.points ?? [],
      context.benchmarkHistory.points,
    )

    return model === null ? null : model.beta
  },

  format: formatRatio,
}
