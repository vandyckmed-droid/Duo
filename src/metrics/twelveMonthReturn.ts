import { calculateTrailingTwelveMonthReturn } from '../calculations/index.ts'
import { formatPercent } from './format.ts'
import type { Metric } from './types.ts'

/**
 * Trailing 12-calendar-month price return, highest first.
 *
 * The launch variable. Note how little there is to it: the calendar
 * arithmetic, the endpoint search and the return math all live in the
 * calculation layer, and the ranking lives in `rankStocks`. What is left
 * here is only the three decisions that are genuinely this variable's —
 * which calculation, how to show it, which way it sorts.
 */
export const twelveMonthReturnMetric: Metric = {
  id: 'twelve-month-return',
  label: '12M',
  order: 'descending',

  compute(stock, context) {
    return calculateTrailingTwelveMonthReturn(
      context.priceHistory[stock.ticker]?.points ?? [],
    )
  },

  format: formatPercent,
}
