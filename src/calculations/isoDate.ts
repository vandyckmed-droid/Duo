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
