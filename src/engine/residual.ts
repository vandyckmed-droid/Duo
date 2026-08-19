import { windowReturn } from './returns.ts'
import { type Closes, type Result, type Window, missing, ok } from './types.ts'

/**
 * Residual return: the part of a stock's move that its benchmark does not
 * account for.
 *
 *     residual = r_stock − β × r_benchmark
 *
 * The intercept is **not** subtracted. Removing alpha as well would define
 * away the very thing being measured: a name that persistently outruns its
 * benchmark would have that outperformance absorbed into its own fitted drift
 * and come back at roughly zero. Beta strips the market exposure; whatever is
 * left is the answer.
 *
 * The benchmark must be the security's **segment** benchmark. A 600 name's
 * residual is measured against IJR, and measuring it against SPY would report
 * a size premium as stock-specific return.
 */
export function residualReturn(
  closes: Closes,
  benchmarkCloses: Closes,
  betaEstimate: Result<{ beta: number }>,
  window: Window,
  evaluatedAt?: number,
): Result<number> {
  if (!betaEstimate.ok) return missing(betaEstimate.reason)

  const stock = windowReturn(closes, window, evaluatedAt)
  if (!stock.ok) return stock

  // The benchmark's own window is anchored at the same calendar index, so both
  // sides measure the same stretch of market activity even when the stock's
  // last print is a day stale.
  const bench = windowReturn(benchmarkCloses, window, evaluatedAt)
  if (!bench.ok) return missing('insufficient-overlap')

  return ok(stock.value - betaEstimate.value.beta * bench.value)
}
