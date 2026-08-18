import type { PriceSeries } from '../data/types.ts'
import { subtractCalendarMonths } from './calendar.ts'
import { calculateRawReturn } from './rawReturn.ts'
import {
  closeAtOrBefore,
  indexAtOrBefore,
  lastUsableIndex,
} from './seriesLookup.ts'

/**
 * A lookback window expressed in whole calendar months back from the
 * series' latest usable close.
 *
 * `{ fromMonthsAgo: 12, toMonthsAgo: 1 }` is the classic 12–1 momentum
 * window: twelve months of history, skipping the most recent month.
 * `{ fromMonthsAgo: 12, toMonthsAgo: 0 }` is a plain trailing 12-month
 * return. Expressing the window as data rather than baking it into separate
 * functions is what lets a new metric reuse this one.
 */
export interface MonthWindow {
  readonly fromMonthsAgo: number
  readonly toMonthsAgo: number
}

/** Both ends of a month window, resolved against a series. */
export interface ResolvedWindow {
  readonly startIndex: number
  readonly endIndex: number
  readonly startClose: number
  readonly endClose: number
}

/**
 * Resolves a month window against a series, or `null` if the series cannot
 * cover it.
 *
 * Anchors to the latest usable close, steps back the requested number of
 * calendar months, and takes the latest usable close at or before each
 * boundary — real calendars rarely have a print on the exact anniversary
 * (weekends, holidays, gaps), so the nearest earlier one stands in.
 *
 * Returns `null` when either boundary predates the series, which is what a
 * stock listed less than `fromMonthsAgo` months ago will do.
 */
export function resolveWindow(
  series: PriceSeries,
  window: MonthWindow,
): ResolvedWindow | null {
  const anchorIndex = lastUsableIndex(series)
  if (anchorIndex === -1) {
    return null
  }

  const anchor = series.timestamps[anchorIndex]
  const startIndex = indexAtOrBefore(
    series.timestamps,
    subtractCalendarMonths(anchor, window.fromMonthsAgo),
  )
  const endIndex = indexAtOrBefore(
    series.timestamps,
    subtractCalendarMonths(anchor, window.toMonthsAgo),
  )
  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    return null
  }

  const startClose = closeAtOrBefore(series, startIndex)
  const endClose = closeAtOrBefore(series, endIndex)
  if (startClose === null || endClose === null) {
    return null
  }

  return { startIndex, endIndex, startClose, endClose }
}

/**
 * Raw return across a month window, or `null` when the series cannot cover
 * it. Reuses `calculateRawReturn` for the return math itself.
 */
export function calculateWindowedReturn(
  series: PriceSeries,
  window: MonthWindow,
): number | null {
  const resolved = resolveWindow(series, window)
  return resolved === null
    ? null
    : calculateRawReturn(resolved.startClose, resolved.endClose)
}
