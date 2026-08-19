import { type Closes, type Result, type Series, missing, ok } from './types.ts'

/**
 * Endpoint selection.
 *
 * Every return in this engine is a ratio of two observations, so the whole
 * family stands or falls on how an endpoint is chosen. The rules:
 *
 *  - Offsets are counted in trading days on the shared calendar, so the
 *    window is a fixed amount of market activity rather than a date range
 *    that a holiday can shorten.
 *  - An endpoint may be pulled back by a few days when the target day is
 *    missing (a suspension, a late listing, a provider gap). Without that
 *    tolerance a single absent print erases a name from the ranking.
 *  - The tolerance is deliberately small. Stretching an endpoint far enough
 *    changes which period is being measured, and a return over the wrong
 *    period is worse than no return at all.
 */

/** How far back an endpoint may be pulled to find a real observation. */
export const ENDPOINT_TOLERANCE = 5

/** Index of the most recent usable close, or −1 if the series is empty. */
export function lastValidIndex(closes: Closes): number {
  for (let i = closes.length - 1; i >= 0; i--) {
    if (isUsable(closes[i])) return i
  }
  return -1
}

/** Index of the earliest usable close, or −1 if the series is empty. */
export function firstValidIndex(closes: Closes): number {
  for (let i = 0; i < closes.length; i++) {
    if (isUsable(closes[i])) return i
  }
  return -1
}

/**
 * A close is usable only if it is a finite, strictly positive number.
 *
 * Zero and negative prices are not merely unusual, they are unrepresentable
 * for an adjusted equity close, and a zero denominator would produce an
 * infinite return that then propagates into every aggregate.
 */
export function isUsable(close: number | null | undefined): close is number {
  return typeof close === 'number' && Number.isFinite(close) && close > 0
}

/**
 * The usable observation at `index`, or the nearest one before it within
 * `tolerance` trading days.
 *
 * Searching backwards only is deliberate: reaching forward would let a window
 * end after the point it claims to end at, which quietly leaks future
 * information into a momentum score.
 */
export function endpointAt(
  closes: Closes,
  index: number,
  tolerance = ENDPOINT_TOLERANCE,
): Result<{ index: number; close: number }> {
  if (index < 0 || index >= closes.length) return missing('insufficient-history')
  const floor = Math.max(0, index - tolerance)
  for (let i = index; i >= floor; i--) {
    const close = closes[i]
    if (isUsable(close)) return ok({ index: i, close })
  }
  return missing('no-observation')
}

/** The number of usable observations in a series. */
export function observationCount(closes: Closes): number {
  let n = 0
  for (const c of closes) if (isUsable(c)) n++
  return n
}

/**
 * Simple daily returns, index-aligned to `closes`.
 *
 * A return exists at `i` only when both `i` and `i − 1` are usable, so a gap
 * consumes the two returns that would otherwise straddle it rather than
 * producing one multi-day return masquerading as a daily one. That matters
 * for volatility: a single ten-day gap booked as one "daily" return inflates
 * the estimate for the whole window.
 */
export function dailyReturns(closes: Closes): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: closes.length }, () => null)
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]
    const curr = closes[i]
    if (isUsable(prev) && isUsable(curr)) out[i] = curr / prev - 1
  }
  return out
}

/**
 * Pairs of daily returns for two series on days where both traded.
 *
 * Beta is meaningless across misaligned observations — regressing a stock's
 * Tuesday against the benchmark's Wednesday measures nothing — so pairs are
 * only emitted where both sides have a real return on the same calendar day.
 */
export function alignedReturns(
  a: Closes,
  b: Closes,
  from = 0,
  to = Math.min(a.length, b.length) - 1,
): { a: number[]; b: number[] } {
  const ra = dailyReturns(a)
  const rb = dailyReturns(b)
  const outA: number[] = []
  const outB: number[] = []
  const start = Math.max(1, from)
  const end = Math.min(to, ra.length - 1, rb.length - 1)
  for (let i = start; i <= end; i++) {
    const x = ra[i]
    const y = rb[i]
    if (x !== null && x !== undefined && y !== null && y !== undefined) {
      outA.push(x)
      outB.push(y)
    }
  }
  return { a: outA, b: outB }
}

/** Convenience: a series' calendar date at an index. */
export function dateAt(series: Series, index: number): string | null {
  return series.calendar[index] ?? null
}
