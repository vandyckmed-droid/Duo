/**
 * The vocabulary of the calculation engine.
 *
 * Everything here is provider-agnostic: the engine never learns that prices
 * came from FMP, and never learns that a security belongs to the S&P 600. It
 * sees aligned numbers on a shared trading-day calendar and nothing else.
 */

/** An ISO `YYYY-MM-DD` calendar date. */
export type IsoDate = string

/**
 * A shared, ascending list of trading days. Every series in a dataset is
 * indexed against the same calendar so that "63 trading days ago" means the
 * same offset for every security, and so two series can be aligned by index
 * rather than by searching dates.
 */
export type Calendar = readonly IsoDate[]

/**
 * Adjusted closes aligned to a `Calendar`. `null` means the security did not
 * trade, or the provider gave nothing usable, on that day. Nulls are never
 * filled in: an absent observation stays absent all the way to the interface.
 */
export type Closes = readonly (number | null)[]

/** A price series bound to the calendar it is indexed against. */
export interface Series {
  readonly calendar: Calendar
  readonly closes: Closes
}

/**
 * A trading-day window measured backwards from the evaluation point.
 *
 * `formation` is the length of the measured period and `skip` is the gap
 * between the evaluation point and the end of that period. Momentum research
 * skips the most recent month to sidestep short-term reversal, which is the
 * "−1" in "12−1"; `skip: 0` gives a plain trailing return.
 *
 * Both are counted in trading days on the calendar, never in calendar months,
 * so a window is the same length of market activity wherever it lands.
 */
export interface Window {
  readonly formation: number
  readonly skip: number
}

/**
 * Why a calculation produced nothing.
 *
 * The engine distinguishes these because the interface has to: a name with a
 * six-month history is a different thing from a name whose provider feed
 * broke, and both are different from a name that is simply too new.
 */
export type Unavailable =
  | 'insufficient-history'
  | 'no-observation'
  | 'invalid-observation'
  | 'insufficient-overlap'
  | 'degenerate-benchmark'

/**
 * A number the engine could not compute, and the reason.
 *
 * Returned as `null` at the boundary of the published dataset — the reason is
 * carried while computing so validation can report *why* coverage is thin.
 */
export interface Missing {
  readonly ok: false
  readonly reason: Unavailable
}

export interface Value<T> {
  readonly ok: true
  readonly value: T
}

export type Result<T> = Value<T> | Missing

export const ok = <T,>(value: T): Value<T> => ({ ok: true, value })
export const missing = (reason: Unavailable): Missing => ({ ok: false, reason })

/** Unwraps a result to a plain number for publishing, losing the reason. */
export const valueOrNull = <T,>(r: Result<T>): T | null => (r.ok ? r.value : null)

/** Trading days per year, the annualisation constant used throughout. */
export const TRADING_DAYS_PER_YEAR = 252
