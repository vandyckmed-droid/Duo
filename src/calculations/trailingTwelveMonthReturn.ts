import type { PricePoint } from '../data/types.ts'
import { isValidPricePoint } from './pricePointValidity.ts'
import { calculateRawReturn } from './rawReturn.ts'

/**
 * Raw return over a true trailing 12-calendar-month period, ending at the
 * latest valid price in the given history.
 *
 * Unlike a plain window return (first valid point to last valid point),
 * this does not treat however much history happens to be supplied as the
 * period — it anchors to a fixed 12-calendar-month span, so a feed with
 * years of history behaves the same as one with exactly a year. The steps:
 *
 * 1. Find the latest valid point — the period's end.
 * 2. Go back exactly 12 calendar months from its date — the anniversary.
 * 3. Use the latest valid point on or before the anniversary as the
 *    period's start. Real feeds rarely have an observation on the exact
 *    anniversary date (weekends, holidays, gaps), so this searches for the
 *    nearest one at or before it rather than requiring an exact match.
 * 4. Reuses `calculateRawReturn` for the return math itself.
 *
 * Returns `null` when there is no valid end point, or no valid point at or
 * before the anniversary — i.e. less than 12 months of usable history.
 */
export function calculateTrailingTwelveMonthReturn(
  points: readonly PricePoint[],
): number | null {
  const endPoint = points.findLast(isValidPricePoint)
  if (!endPoint) {
    return null
  }

  const anniversary = subtractTwelveCalendarMonths(endPoint.date)
  const startPoint = points.findLast(
    (point) => isValidPricePoint(point) && point.date <= anniversary,
  )
  if (!startPoint) {
    return null
  }

  return calculateRawReturn(startPoint.adjustedClose, endPoint.adjustedClose)
}

/**
 * Subtracts exactly 12 calendar months from an ISO 8601 date (YYYY-MM-DD),
 * returning the result in the same format.
 *
 * 12 months is always the same calendar month one year earlier, so the only
 * way the day-of-month can be invalid there is 29 February in a leap year —
 * the prior year's February may only have 28 days. That day is clamped to
 * the target month's last day (28 February) rather than left to `Date.UTC`,
 * which would silently normalize it forward into March.
 *
 * Computed in UTC so the calendar date isn't shifted by the host machine's
 * local timezone.
 */
function subtractTwelveCalendarMonths(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  const targetYear = date.getUTCFullYear() - 1
  const targetMonth = date.getUTCMonth()
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate()
  const day = Math.min(date.getUTCDate(), lastDayOfTargetMonth)

  return new Date(Date.UTC(targetYear, targetMonth, day))
    .toISOString()
    .slice(0, 10)
}
