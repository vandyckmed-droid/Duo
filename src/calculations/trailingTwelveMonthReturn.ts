import type { PricePoint } from '../data/types.ts'
import type { PriceObservation } from './priceObservation.ts'
import { toPriceObservation } from './priceObservation.ts'
import { calculateRawReturn } from './rawReturn.ts'

/**
 * Raw return over a true trailing 12-calendar-month period, ending at the
 * latest usable price in the given history.
 *
 * Unlike a plain window return (first usable point to last usable point),
 * this does not treat however much history happens to be supplied as the
 * period — it anchors to a fixed 12-calendar-month span, so a feed with
 * years of history behaves the same as one with exactly a year. The steps:
 *
 * 1. Find the usable point with the latest date — the period's end.
 * 2. Go back exactly 12 calendar months from that date — the anniversary.
 * 3. Use the latest usable point on or before the anniversary as the
 *    period's start. Real feeds rarely have an observation on the exact
 *    anniversary date (weekends, holidays, gaps), so this takes the nearest
 *    one at or before it rather than requiring an exact match.
 * 4. Reuses `calculateRawReturn` for the return math itself.
 *
 * Endpoints are chosen by comparing dates, not by array position, so the
 * result does not depend on how the caller ordered `points` — oldest-first,
 * newest-first (as several price APIs return) and unsorted all yield the
 * same answer. That holds even when two points share a date; see `latest`
 * for how such a tie is settled.
 *
 * Returns `null` when there is no usable point, or none at or before the
 * anniversary — i.e. less than 12 months of usable history.
 */
export function calculateTrailingTwelveMonthReturn(
  points: readonly PricePoint[],
): number | null {
  const observations = points
    .map(toPriceObservation)
    .filter((observation) => observation !== null)

  const end = latest(observations)
  if (!end) {
    return null
  }

  const anniversary = subtractTwelveCalendarMonths(end.timestamp)
  const start = latest(
    observations.filter((observation) => observation.timestamp <= anniversary),
  )
  if (!start) {
    return null
  }

  return calculateRawReturn(start.adjustedClose, end.adjustedClose)
}

/**
 * The observation with the latest timestamp, or `null` if there are none.
 *
 * Two observations sharing a date is a defect in the source data — a price
 * series should carry one close per day. Rather than let array position
 * decide (which would make the result depend on input ordering again, the
 * very thing this module avoids), ties are broken by price. The rule is
 * arbitrary; being a rule at all is the point, since it makes the outcome a
 * function of the observations themselves.
 */
function latest(
  observations: readonly PriceObservation[],
): PriceObservation | null {
  return observations.reduce<PriceObservation | null>(
    (newest, observation) =>
      newest === null || isLater(observation, newest) ? observation : newest,
    null,
  )
}

function isLater(a: PriceObservation, b: PriceObservation): boolean {
  return a.timestamp === b.timestamp
    ? a.adjustedClose > b.adjustedClose
    : a.timestamp > b.timestamp
}

/**
 * Subtracts exactly 12 calendar months from a UTC timestamp.
 *
 * 12 months is always the same calendar month one year earlier, so the only
 * way the day-of-month can be invalid there is 29 February in a leap year —
 * the prior year's February may only have 28 days. That day is clamped to
 * the target month's last day (28 February) rather than left to `Date.UTC`,
 * which would silently normalize it forward into March.
 */
function subtractTwelveCalendarMonths(timestamp: number): number {
  const date = new Date(timestamp)
  const targetYear = date.getUTCFullYear() - 1
  const targetMonth = date.getUTCMonth()
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate()

  return Date.UTC(
    targetYear,
    targetMonth,
    Math.min(date.getUTCDate(), lastDayOfTargetMonth),
  )
}
