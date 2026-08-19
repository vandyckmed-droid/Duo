import { dailyReturns, isUsable, lastValidIndex } from './series.ts'
import { type Closes, type Result, missing, ok } from './types.ts'

/**
 * Path quality: how a return was earned, not how large it was.
 *
 * Two stocks up 40% are not the same stock. One climbed in many small steps
 * distributed through the year; the other went nowhere for eleven months and
 * gapped on one headline. Momentum research treats that distinction as
 * informative — persistent trends and discrete jumps have different follow-
 * through — so the engine measures the path separately from the return.
 *
 * Everything here follows the house rules: trading-day windows on the shared
 * calendar, `evaluatedAt` anchoring so the same code serves the live dataset
 * and point-in-time research, gaps skipped rather than filled, and a coverage
 * floor below which a statistic is refused rather than estimated from a
 * different sample than its label claims.
 */

/** Minimum share of a path window that must contain real daily returns. */
export const PATH_MIN_COVERAGE = 0.6

/** Collects the window's usable daily returns, newest window only. */
function windowDailyReturns(
  closes: Closes,
  lookback: number,
  evaluatedAt?: number,
): Result<number[]> {
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
  if (sample.length < Math.ceil(lookback * PATH_MIN_COVERAGE)) {
    return missing('insufficient-history')
  }
  return ok(sample)
}

/**
 * Share of trading days with a positive return over the trailing `lookback`
 * days. A persistent climb sits near 0.55–0.60; a flat series near 0.50; a
 * one-gap year can win the window with a share below half.
 */
export function positiveDayShare(
  closes: Closes,
  lookback: number,
  evaluatedAt?: number,
): Result<number> {
  const sample = windowDailyReturns(closes, lookback, evaluatedAt)
  if (!sample.ok) return sample
  let up = 0
  for (const r of sample.value) if (r > 0) up++
  return ok(up / sample.value.length)
}

/**
 * Share of the window's total log return contributed by its `k` largest
 * up-days.
 *
 * Log returns are used because they add: the sum over days equals the whole
 * window, so "the top 5 days produced 80% of the move" is exact arithmetic
 * rather than an approximation. Only defined when the window's total log
 * return is positive — concentration describes how a gain was assembled, and
 * dividing by a loss would make lower concentration read as better while
 * meaning nothing.
 *
 * High values mark discrete trends: returns that live in a handful of jumps.
 * Low values mark persistent trends assembled from many ordinary days.
 */
export function topDayConcentration(
  closes: Closes,
  lookback: number,
  k: number,
  evaluatedAt?: number,
): Result<number> {
  const sample = windowDailyReturns(closes, lookback, evaluatedAt)
  if (!sample.ok) return sample
  if (k <= 0 || sample.value.length <= k) return missing('insufficient-history')

  let total = 0
  const logs: number[] = []
  for (const r of sample.value) {
    const growth = 1 + r
    // A −100% print would make the log undefined; the series module already
    // rejects non-positive closes, so this only guards arithmetic edge cases.
    if (growth <= 0) return missing('invalid-observation')
    const lr = Math.log(growth)
    logs.push(lr)
    total += lr
  }
  if (total <= 0) return missing('invalid-observation')

  const top = logs
    .filter((lr) => lr > 0)
    .toSorted((a, b) => b - a)
    .slice(0, k)
  let sum = 0
  for (const lr of top) sum += lr
  return ok(sum / total)
}

/**
 * Current price relative to the highest close of the trailing `lookback`
 * trading days, in (0, 1]. 1.0 means the evaluation day *is* the high.
 *
 * The high is taken over the window ending at the evaluation day, so the
 * statistic never sees a later price. This is the 52-week-high measure when
 * called with a 252-day lookback.
 */
export function distanceFromHigh(
  closes: Closes,
  lookback: number,
  evaluatedAt?: number,
): Result<number> {
  const anchor = evaluatedAt ?? lastValidIndex(closes)
  if (anchor < 0) return missing('no-observation')
  const from = anchor - lookback + 1
  if (from < 0) return missing('insufficient-history')

  const price = closes[anchor]
  if (!isUsable(price)) return missing('no-observation')

  let high = 0
  let seen = 0
  for (let i = from; i <= anchor; i++) {
    const close = closes[i]
    if (!isUsable(close)) continue
    seen++
    if (close > high) high = close
  }
  if (seen < Math.ceil(lookback * PATH_MIN_COVERAGE)) {
    return missing('insufficient-history')
  }
  return ok(price / high)
}

/**
 * Share of the trailing `recent` trading days spent within `band` of the
 * running `lookback`-day high — "time near the high".
 *
 * For each of the recent days the reference high is the highest close of the
 * `lookback` days ending *on that day*, so no day is compared against a high
 * it could not yet have seen. A stock consolidating just under its high scores
 * near 1; one that touched the high once and fell away scores near 0.
 */
export function timeNearHigh(
  closes: Closes,
  lookback: number,
  recent: number,
  band: number,
  evaluatedAt?: number,
): Result<number> {
  const anchor = evaluatedAt ?? lastValidIndex(closes)
  if (anchor < 0) return missing('no-observation')
  const firstRecent = anchor - recent + 1
  if (firstRecent - lookback + 1 < 0) return missing('insufficient-history')

  // Sliding-window maximum via a monotonic deque of indices: O(n) over the
  // recent span rather than O(recent × lookback).
  const deque: number[] = []
  const push = (i: number) => {
    const close = closes[i]
    if (!isUsable(close)) return
    while (deque.length > 0) {
      const tail = closes[deque[deque.length - 1] as number]
      if (isUsable(tail) && tail <= close) deque.pop()
      else break
    }
    deque.push(i)
  }
  for (let i = firstRecent - lookback + 1; i < firstRecent; i++) push(i)

  let near = 0
  let seen = 0
  for (let day = firstRecent; day <= anchor; day++) {
    push(day)
    while (deque.length > 0 && (deque[0] as number) < day - lookback + 1) deque.shift()
    const price = closes[day]
    if (!isUsable(price)) continue
    const head = deque[0]
    if (head === undefined) continue
    const high = closes[head]
    if (!isUsable(high)) continue
    seen++
    if (price >= high * (1 - band)) near++
  }
  if (seen < Math.ceil(recent * PATH_MIN_COVERAGE)) {
    return missing('insufficient-history')
  }
  return ok(near / seen)
}

/**
 * Downside deviation: the annualised standard deviation of only the negative
 * daily returns over the trailing `lookback` days.
 *
 * Risk that matters to an owner is loss, not movement. Two names with equal
 * volatility can have very different downside halves, and this is the risk
 * engine's view of that difference. Computed against zero rather than the
 * mean so that "down days" means literally down.
 */
export function downsideDeviation(
  closes: Closes,
  lookback: number,
  evaluatedAt?: number,
): Result<number> {
  const sample = windowDailyReturns(closes, lookback, evaluatedAt)
  if (!sample.ok) return sample
  let sq = 0
  for (const r of sample.value) {
    if (r < 0) sq += r * r
  }
  return ok(Math.sqrt(sq / sample.value.length) * Math.sqrt(252))
}
