import { endpointAt, isUsable, lastValidIndex } from './series.ts'
import { type Closes, type Result, type Window, missing, ok } from './types.ts'

/**
 * Return over a trading-day window.
 *
 * `window.formation` is how many trading days the measured period spans and
 * `window.skip` is how many trading days sit between the evaluation point and
 * the end of that period:
 *
 *     … ── start ────── formation ────── end ── skip ── evaluated at
 *
 * 12−1 momentum is `{ formation: 252, skip: 21 }`: a year of price movement
 * ending a month before today. Raw trailing return is the same shape with
 * `skip: 0`. A three-month horizon is `{ formation: 63, skip: 0 }` — a new
 * horizon is a new pair of numbers, never a new code path.
 */
export function windowReturn(
  closes: Closes,
  window: Window,
  evaluatedAt?: number,
): Result<number> {
  const anchor = evaluatedAt ?? lastValidIndex(closes)
  if (anchor < 0) return missing('no-observation')

  const endTarget = anchor - window.skip
  const startTarget = endTarget - window.formation
  // Rejected before searching: with the start target off the front of the
  // calendar there is no amount of tolerance that makes the window the length
  // it claims to be. A shorter window silently substituted here would rank a
  // six-month-old listing against a full year of everyone else.
  if (startTarget < 0) return missing('insufficient-history')

  const end = endpointAt(closes, endTarget)
  if (!end.ok) return end
  const start = endpointAt(closes, startTarget)
  if (!start.ok) return start

  // Tolerance may pull both endpoints back; if it pulls them onto the same
  // day the "return" would be exactly zero by construction.
  if (end.value.index <= start.value.index) return missing('insufficient-history')

  return ok(end.value.close / start.value.close - 1)
}

/**
 * Cumulative return between two calendar indices, used by the detail chart's
 * horizon switcher where the endpoints come from the chart rather than from a
 * formation window.
 */
export function returnBetween(
  closes: Closes,
  startIndex: number,
  endIndex: number,
): Result<number> {
  if (startIndex >= endIndex) return missing('insufficient-history')
  const start = endpointAt(closes, startIndex)
  if (!start.ok) return start
  const end = endpointAt(closes, endIndex)
  if (!end.ok) return end
  if (end.value.index <= start.value.index) return missing('insufficient-history')
  return ok(end.value.close / start.value.close - 1)
}

/**
 * Annualises a total return realised over `tradingDays`.
 *
 * Only meaningful for windows of at least a few months; annualising a week is
 * arithmetic, not information, so the caller decides when to use it.
 */
export function annualise(totalReturn: number, tradingDays: number): Result<number> {
  if (tradingDays <= 0) return missing('insufficient-history')
  const growth = 1 + totalReturn
  if (growth <= 0) return missing('invalid-observation')
  return ok(growth ** (252 / tradingDays) - 1)
}

/**
 * Maximum drawdown over the trailing `lookback` trading days: the deepest
 * peak-to-trough fall, as a negative fraction.
 *
 * Gaps are skipped rather than filled — a missing day cannot be a new peak or
 * a new trough, and inventing a price there would invent a drawdown.
 */
export function maxDrawdown(
  closes: Closes,
  lookback: number,
  evaluatedAt?: number,
): Result<number> {
  const anchor = evaluatedAt ?? lastValidIndex(closes)
  if (anchor < 0) return missing('no-observation')
  const from = anchor - lookback
  if (from < 0) return missing('insufficient-history')

  let peak = Number.NEGATIVE_INFINITY
  let worst = 0
  let seen = 0
  for (let i = from; i <= anchor; i++) {
    const close = closes[i]
    if (!isUsable(close)) continue
    seen++
    if (close > peak) peak = close
    const fall = close / peak - 1
    if (fall < worst) worst = fall
  }
  // A drawdown from a handful of prints is noise wearing a statistic's name.
  if (seen < Math.max(20, lookback * 0.5)) return missing('insufficient-history')
  return ok(worst)
}
