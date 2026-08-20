import { priceRange } from '../src/calc/series.ts'
import { SIGNAL_IDS, SIGNAL_WINDOWS, momentumSignal } from '../src/calc/signals.ts'
import type { Exclusion, SecurityRecord, SignalId, WindowSpec } from '../src/domain/dataset.ts'
import type { PricePoint } from './fmp.ts'
import type { Member } from './membership.ts'

/**
 * Turning cached prices into the published numbers.
 *
 * Two decisions govern this file.
 *
 * **One calendar for everybody.** The trading calendar comes from the SPY
 * series, and every security's closes are aligned onto it, with nulls where a
 * name did not print. Counting trading days on any other axis makes "252 days
 * ago" mean different periods for different names.
 *
 * **One anchor for everybody.** Every window is measured backwards from the
 * dataset's last trading day, not from each security's own last print. If a
 * name whose feed stopped two weeks ago were measured from its own last
 * close, its "12-month return" would cover a different year than everyone
 * else's and rank against them as though it did not. Endpoint tolerance
 * absorbs a few missing days; beyond that the security is excluded, which is
 * the honest answer for a halted name.
 */

/** Trading days of the 52-week range. */
export const RANGE_LOOKBACK = 252

/**
 * Trading days of history the calendar must span: the longest formation
 * window plus its skip, with slack for endpoint tolerance and holidays.
 */
export const HISTORY_TRADING_DAYS =
  Math.max(...Object.values(SIGNAL_WINDOWS).map((w: WindowSpec) => w.formation + w.skip)) + 15

export interface AlignedUniverse {
  readonly calendar: string[]
  readonly closes: Map<string, (number | null)[]>
}

/**
 * Builds the shared calendar from the anchor series and aligns every security
 * onto it, keeping the most recent `HISTORY_TRADING_DAYS` days. Observations
 * on dates the anchor never traded (foreign-listed quirks, bad prints) are
 * dropped rather than given invented calendar positions.
 */
export function alignToCalendar(
  anchorPoints: readonly PricePoint[],
  securities: ReadonlyMap<string, readonly PricePoint[]>,
): AlignedUniverse {
  const calendar = anchorPoints
    .map((p) => p.date)
    .sort()
    .slice(-HISTORY_TRADING_DAYS)
  const indexOf = new Map(calendar.map((date, i) => [date, i]))

  const closes = new Map<string, (number | null)[]>()
  for (const [ticker, points] of securities) {
    const aligned: (number | null)[] = Array.from({ length: calendar.length }, () => null)
    for (const point of points) {
      const i = indexOf.get(point.date)
      if (i !== undefined) aligned[i] = point.close
    }
    closes.set(ticker, aligned)
  }
  return { calendar, closes }
}

export interface ComputeResult {
  readonly securities: SecurityRecord[]
  readonly excluded: Exclusion[]
}

/**
 * Computes every security's published record, or the reason it has none.
 *
 * A record is all-or-nothing: every signal and the full 52-week range, or an
 * exclusion listed in the manifest. Partial rows would rank against complete
 * ones on different information.
 */
export function computeUniverse(
  members: readonly Member[],
  aligned: AlignedUniverse,
): ComputeResult {
  const securities: SecurityRecord[] = []
  const excluded: Exclusion[] = []
  const anchor = aligned.calendar.length - 1

  for (const member of members) {
    const closes = aligned.closes.get(member.ticker) ?? []

    const signals: Record<SignalId, number> = {}
    let missing: SignalId | null = null
    for (const id of SIGNAL_IDS) {
      const value = momentumSignal(closes, SIGNAL_WINDOWS[id] as WindowSpec, anchor)
      if (value === null) {
        missing = id
        break
      }
      signals[id] = value
    }
    if (missing !== null) {
      excluded.push({
        ticker: member.ticker,
        reason: `insufficient history for the ${missing} signal`,
      })
      continue
    }

    const range = priceRange(closes, RANGE_LOOKBACK)
    if (!range) {
      excluded.push({ ticker: member.ticker, reason: 'too few closes for a 52-week range' })
      continue
    }

    securities.push({
      ticker: member.ticker,
      name: member.name,
      segment: member.segment,
      sector: member.sector,
      signals,
      last: range.last,
      lastDate: aligned.calendar[range.lastIndex] as string,
      low52: range.low,
      high52: range.high,
    })
  }

  return { securities, excluded }
}
