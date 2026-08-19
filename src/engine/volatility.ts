import { dailyReturns } from './series.ts'
import { lastValidIndex } from './series.ts'
import {
  type Closes,
  type Result,
  TRADING_DAYS_PER_YEAR,
  missing,
  ok,
} from './types.ts'

/**
 * Minimum share of a volatility window that must contain real returns.
 *
 * Below this the estimate is being formed from a different, shorter sample
 * than the one it is labelled with, which makes it incomparable to the rest of
 * the ranking. Comparability is the whole point of the number.
 */
export const MIN_COVERAGE = 0.6

/** Sample standard deviation (n − 1). Fewer than two points has no spread. */
export function stdev(xs: readonly number[]): Result<number> {
  if (xs.length < 2) return missing('insufficient-history')
  let sum = 0
  for (const x of xs) sum += x
  const average = sum / xs.length
  let sq = 0
  for (const x of xs) sq += (x - average) ** 2
  return ok(Math.sqrt(sq / (xs.length - 1)))
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  let sum = 0
  for (const x of xs) sum += x
  return sum / xs.length
}

/**
 * Annualised realised volatility from daily returns over the trailing
 * `lookback` trading days: the sample standard deviation of daily simple
 * returns scaled by √252.
 *
 * Simple rather than log returns, so that this volatility and the return it is
 * divided by in return/vol are built from the same quantity.
 */
export function realisedVolatility(
  closes: Closes,
  lookback: number,
  evaluatedAt?: number,
): Result<number> {
  const anchor = evaluatedAt ?? lastValidIndex(closes)
  if (anchor < 0) return missing('no-observation')
  const from = anchor - lookback + 1
  if (from < 1) return missing('insufficient-history')

  const returns = dailyReturns(closes)
  const sample: number[] = []
  for (let i = from; i <= anchor; i++) {
    const r = returns[i]
    if (r !== null && r !== undefined) sample.push(r)
  }
  if (sample.length < Math.ceil(lookback * MIN_COVERAGE)) {
    return missing('insufficient-history')
  }

  const sd = stdev(sample)
  if (!sd.ok) return sd
  return ok(sd.value * Math.sqrt(TRADING_DAYS_PER_YEAR))
}

/**
 * Return per unit of volatility.
 *
 * Deliberately not a Sharpe ratio: no risk-free rate is subtracted, because
 * this exists to make two names comparable, not to price them. A negative
 * return divided by volatility stays negative and stays ranked last, which is
 * the behaviour the list wants.
 */
export function returnPerVol(
  totalReturn: Result<number>,
  volatility: Result<number>,
): Result<number> {
  if (!totalReturn.ok) return totalReturn
  if (!volatility.ok) return volatility
  // A genuinely zero-volatility series is a stale or halted feed, not a
  // risk-free stock; dividing by it would mint an infinite score.
  if (volatility.value <= 1e-9) return missing('invalid-observation')
  return ok(totalReturn.value / volatility.value)
}
