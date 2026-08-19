import { alignedReturns } from './series.ts'
import { lastValidIndex } from './series.ts'
import { type Closes, type Result, missing, ok } from './types.ts'

/**
 * Ordinary least squares of a stock's daily returns on its benchmark's.
 *
 * Fitted **with an intercept**: constraining the line through the origin would
 * fold the stock's average drift into the slope, and the slope is exactly what
 * the residual calculation then removes. The intercept is estimated so that it
 * can be discarded honestly rather than never estimated at all.
 */
export interface Regression {
  /** Slope: sensitivity of the stock to its benchmark. */
  readonly beta: number
  /** Intercept, in daily return units. Reported, never subtracted. */
  readonly alpha: number
  /** Share of the stock's variance explained by the benchmark. */
  readonly rSquared: number
  /** Number of days on which both sides had a real return. */
  readonly observations: number
}

/** Fewer paired days than this and the slope is not an estimate, it is noise. */
export const MIN_REGRESSION_OBSERVATIONS = 120

export function ols(
  stockReturns: readonly number[],
  benchmarkReturns: readonly number[],
): Result<Regression> {
  const n = Math.min(stockReturns.length, benchmarkReturns.length)
  if (n < MIN_REGRESSION_OBSERVATIONS) return missing('insufficient-overlap')

  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += benchmarkReturns[i] as number
    sy += stockReturns[i] as number
  }
  const mx = sx / n
  const my = sy / n

  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = (benchmarkReturns[i] as number) - mx
    const dy = (stockReturns[i] as number) - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  // A benchmark that never moves cannot explain anything; the slope would be
  // a division by zero dressed up as a beta.
  if (sxx <= 1e-18) return missing('degenerate-benchmark')

  const beta = sxy / sxx
  const alpha = my - beta * mx
  const rSquared = syy <= 1e-18 ? 0 : (sxy * sxy) / (sxx * syy)
  return ok({ beta, alpha, rSquared, observations: n })
}

/**
 * Beta of a security against its **segment benchmark**, estimated over the
 * trailing `lookback` trading days of aligned daily returns.
 *
 * The caller is responsible for handing in the right benchmark. Which one that
 * is, is decided by the security's segment — a MidCap 400 name is regressed
 * against IJH, never against SPY — and that mapping lives in the domain layer
 * so this function cannot get it wrong on its own.
 */
export function beta(
  closes: Closes,
  benchmarkCloses: Closes,
  lookback: number,
  evaluatedAt?: number,
): Result<Regression> {
  const anchor = evaluatedAt ?? lastValidIndex(closes)
  if (anchor < 0) return missing('no-observation')
  const from = Math.max(1, anchor - lookback + 1)
  const { a, b } = alignedReturns(closes, benchmarkCloses, from, anchor)
  return ols(a, b)
}
