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
 * Computed in UTC so the calendar date isn't shifted by the host machine's
 * local timezone. `Date.UTC` normalizes an out-of-range day (e.g. the
 * 29th–31st landing in a shorter target month) by rolling into the
 * following month, which is an acceptable, well-defined resolution for the
 * rare date this can affect.
 */
function subtractTwelveCalendarMonths(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  const anniversary = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 12, date.getUTCDate()),
  )
  return anniversary.toISOString().slice(0, 10)
}
