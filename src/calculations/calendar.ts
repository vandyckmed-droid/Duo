/**
 * Subtracts a whole number of calendar months from a UTC timestamp.
 *
 * Landing on a day the target month does not have — 31 August minus one
 * month, or 29 February minus twelve — clamps to that month's last day.
 * `Date.UTC` would instead normalize the overflow forward into the next
 * month, quietly moving the anniversary past the boundary the caller asked
 * for; clamping keeps it inside.
 */
export function subtractCalendarMonths(
  timestamp: number,
  months: number,
): number {
  const date = new Date(timestamp)

  const shifted = date.getUTCMonth() - months
  const targetYear = date.getUTCFullYear() + Math.floor(shifted / 12)
  const targetMonth = ((shifted % 12) + 12) % 12

  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate()

  return Date.UTC(
    targetYear,
    targetMonth,
    Math.min(date.getUTCDate(), lastDayOfTargetMonth),
  )
}
