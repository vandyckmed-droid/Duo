/**
 * Price-series primitives.
 *
 * A series is adjusted daily closes aligned to a shared trading calendar:
 * `closes[i]` is the close on `calendar[i]`, or `null` where the name did not
 * print that day. Everything here is a pure function of that array — no dates,
 * no providers, no I/O — so the same code runs in the pipeline and could run
 * in the browser.
 *
 * Every return is a ratio of two observations, so the family stands or falls
 * on endpoint selection:
 *
 *  - Offsets are counted in trading days on the shared calendar, so a window
 *    is a fixed amount of market activity rather than a date range a holiday
 *    can shorten.
 *  - An endpoint may be pulled back a few days when the target day is missing
 *    (a suspension, a provider gap). Without that tolerance a single absent
 *    print erases a name from the ranking.
 *  - The tolerance is small and searches backwards only. Reaching forward
 *    would let a window end after the point it claims to end at, leaking
 *    future information into a momentum score.
 */

export type Closes = readonly (number | null)[]

/** How far back an endpoint may be pulled to find a real observation. */
export const ENDPOINT_TOLERANCE = 5

/**
 * A close is usable only if it is a finite, strictly positive number. Zero and
 * negative prices are unrepresentable for an adjusted equity close, and a zero
 * denominator would mint an infinite return.
 */
export function isUsable(close: number | null | undefined): close is number {
  return typeof close === 'number' && Number.isFinite(close) && close > 0
}

/** Index of the most recent usable close, or −1 if there is none. */
export function lastValidIndex(closes: Closes): number {
  for (let i = closes.length - 1; i >= 0; i--) {
    if (isUsable(closes[i])) return i
  }
  return -1
}

/** The number of usable observations in a series. */
export function observationCount(closes: Closes): number {
  let n = 0
  for (const c of closes) if (isUsable(c)) n++
  return n
}

/**
 * The usable observation at `index`, or the nearest one before it within
 * `tolerance` trading days. Null when nothing usable is in reach.
 */
export function endpointAt(
  closes: Closes,
  index: number,
  tolerance = ENDPOINT_TOLERANCE,
): { index: number; close: number } | null {
  if (index < 0 || index >= closes.length) return null
  const floor = Math.max(0, index - tolerance)
  for (let i = index; i >= floor; i--) {
    const close = closes[i]
    if (isUsable(close)) return { index: i, close }
  }
  return null
}

/**
 * Simple daily returns, index-aligned to `closes`.
 *
 * A return exists at `i` only when both `i` and `i − 1` are usable, so a gap
 * consumes the two returns that would otherwise straddle it rather than
 * producing one multi-day return masquerading as a daily one. That matters for
 * volatility: a ten-day gap booked as one "daily" return inflates the estimate
 * for the whole window.
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
 * Min, max and latest usable close over the trailing `lookback` trading days.
 * Null when the span holds too few observations to describe a real range.
 */
export function priceRange(
  closes: Closes,
  lookback: number,
  minimumObservations = 20,
): { low: number; high: number; last: number; lastIndex: number } | null {
  const anchor = lastValidIndex(closes)
  if (anchor < 0) return null
  const from = Math.max(0, closes.length - lookback)
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  let seen = 0
  for (let i = from; i < closes.length; i++) {
    const close = closes[i]
    if (!isUsable(close)) continue
    seen++
    if (close < low) low = close
    if (close > high) high = close
  }
  if (seen < minimumObservations) return null
  return { low, high, last: closes[anchor] as number, lastIndex: anchor }
}
