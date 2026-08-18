import type { PricePoint } from '../data/types.ts'

/**
 * A price point that has been proven usable: a real calendar date resolved
 * to a UTC timestamp, paired with a positive finite price.
 *
 * Carrying the parsed timestamp rather than the original string means
 * downstream code compares dates numerically, never lexically, and never
 * re-parses.
 */
export interface PriceObservation {
  readonly timestamp: number
  readonly adjustedClose: number
}

/**
 * Converts a price point into a `PriceObservation`, or `null` if it is not
 * usable.
 *
 * A point is usable only when its price is a positive finite number *and*
 * its date is a real calendar date. Validating the date here is what keeps
 * a malformed date failing the same safe way a malformed price already
 * does — as a skipped point, not a thrown exception that takes down the
 * calculation for every other stock alongside it.
 */
export function toPriceObservation(point: PricePoint): PriceObservation | null {
  if (!Number.isFinite(point.adjustedClose) || point.adjustedClose <= 0) {
    return null
  }

  const timestamp = parseIsoDateToUtc(point.date)
  if (timestamp === null) {
    return null
  }

  return { timestamp, adjustedClose: point.adjustedClose }
}

/**
 * Parses the leading YYYY-MM-DD of an ISO 8601 date into a UTC timestamp,
 * or `null` if it is not a real calendar date.
 *
 * Accepts a bare date, or a date followed by a time separator — a full
 * datetime (`2024-01-15T00:00:00Z`, as several price feeds return) resolves
 * to the same instant as the bare date rather than failing. Anything else
 * trailing the date is rejected, so a corrupt value like `2024-01-159` does
 * not quietly read as the 15th.
 *
 * `Date.UTC` silently normalizes impossible dates — 2023-02-30 becomes
 * 2023-03-02, and a two-digit year is shifted into the 1900s — so the
 * result is checked to round-trip back to the input fields, and rejected
 * when it does not.
 */
export function parseIsoDateToUtc(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)
  const roundTrips =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day

  return roundTrips ? timestamp : null
}
