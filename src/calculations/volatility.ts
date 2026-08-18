import type { PriceSeries } from '../data/types.ts'
import type { MonthWindow } from './windowedReturn.ts'
import { resolveWindow } from './windowedReturn.ts'

/** Trading days per year, used to annualize a daily standard deviation. */
export const TRADING_DAYS_PER_YEAR = 252

/**
 * Fewest daily returns worth taking a standard deviation of. A handful of
 * prints after a fresh listing would produce a number, but not a meaningful
 * one, so the metric reports "no value" instead of a misleading figure.
 */
const MIN_RETURNS = 20

/**
 * Annualized standard deviation of daily returns across a month window, or
 * `null` when the series cannot cover it.
 *
 * Uses the same window as the return metrics, so volatility and momentum
 * describe the same stretch of history and can be read against each other.
 * Gaps are stepped over: returns are taken between consecutive *usable*
 * closes, so a halt does not manufacture a fake one-day move.
 */
export function calculateVolatility(
  series: PriceSeries,
  window: MonthWindow,
): number | null {
  const resolved = resolveWindow(series, window)
  if (resolved === null) {
    return null
  }

  const returns = dailyReturnsBetween(
    series,
    resolved.startIndex,
    resolved.endIndex,
  )
  if (returns.length < MIN_RETURNS) {
    return null
  }

  return standardDeviation(returns) * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

/**
 * Simple returns between consecutive usable closes in `[start, end]`.
 *
 * Exported because the residual-return work this dataset is sized for needs
 * exactly this series, per stock and for the index, before it can regress
 * one on the other.
 */
export function dailyReturnsBetween(
  series: PriceSeries,
  startIndex: number,
  endIndex: number,
): number[] {
  const returns: number[] = []
  let previous: number | null = null

  for (let i = Math.max(startIndex, 0); i <= endIndex; i++) {
    const close = series.closes[i]
    if (close === null || !Number.isFinite(close) || close <= 0) {
      continue
    }
    if (previous !== null) {
      returns.push(close / previous - 1)
    }
    previous = close
  }

  return returns
}

/** Sample standard deviation (Bessel-corrected). */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) {
    return 0
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1)

  return Math.sqrt(variance)
}
