import { windowReturn } from './returns.ts'
import { dailyReturns, lastValidIndex } from './series.ts'
import { stdev } from './volatility.ts'
import {
  TRADING_DAYS_PER_YEAR,
  type Closes,
  type Result,
  type Window,
  missing,
  ok,
} from './types.ts'

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

/**
 * Annualised volatility of daily residuals over a window: the standard
 * deviation of (stock return − β × benchmark return) on days both traded,
 * scaled by √252.
 *
 * This is the denominator of residual-per-volatility momentum (Blitz, Huij &
 * Martens 2011): dividing residual return by its own noise rewards names
 * whose benchmark-stripped strength was steady rather than lucky. The same
 * window semantics as everything else — `formation` days ending `skip` days
 * before the anchor — and the same coverage floor as realised volatility:
 * below it the estimate describes a different sample than its label claims.
 */
export function residualVolatility(
  closes: Closes,
  benchmarkCloses: Closes,
  betaEstimate: Result<{ beta: number }>,
  window: Window,
  evaluatedAt?: number,
): Result<number> {
  if (!betaEstimate.ok) return missing(betaEstimate.reason)
  const beta = betaEstimate.value.beta

  const anchor = evaluatedAt ?? lastValidIndex(closes)
  if (anchor < 0) return missing('no-observation')
  const end = anchor - window.skip
  const from = end - window.formation + 1
  if (from < 1) return missing('insufficient-history')

  const stock = dailyReturns(closes)
  const bench = dailyReturns(benchmarkCloses)
  const sample: number[] = []
  for (let i = from; i <= end; i++) {
    const rs = stock[i]
    const rb = bench[i]
    if (rs !== null && rs !== undefined && rb !== null && rb !== undefined) {
      sample.push(rs - beta * rb)
    }
  }
  if (sample.length < Math.ceil(window.formation * 0.6)) {
    return missing('insufficient-overlap')
  }

  const sd = stdev(sample)
  if (!sd.ok) return sd
  return ok(sd.value * Math.sqrt(TRADING_DAYS_PER_YEAR))
}
