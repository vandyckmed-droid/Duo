import type { PriceSeries } from '../data/types.ts'

/**
 * Index of the latest entry dated at or before `target`, or `-1` if the
 * series begins after it.
 *
 * Binary search over the shared, strictly ascending calendar established by
 * the loader. Scanning instead would turn each metric into a linear pass per
 * stock; over 400 stocks and several metrics that is the difference between
 * instant and noticeable on a phone.
 */
export function indexAtOrBefore(
  timestamps: readonly number[],
  target: number,
): number {
  let low = 0
  let high = timestamps.length - 1
  let found = -1

  while (low <= high) {
    const mid = (low + high) >> 1
    if (timestamps[mid] <= target) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return found
}

/**
 * The latest usable close at or before `index`, or `null` if there is none.
 *
 * Walks back over gaps — holidays, halts, the stretch before a recent
 * listing — so a metric anchored to a date with no print uses the most
 * recent real one instead of failing.
 */
export function closeAtOrBefore(
  series: PriceSeries,
  index: number,
): number | null {
  for (let i = Math.min(index, series.closes.length - 1); i >= 0; i--) {
    const close = series.closes[i]
    if (close !== null && Number.isFinite(close) && close > 0) {
      return close
    }
  }
  return null
}

/** Index of the series' latest usable close, or `-1` if it has none. */
export function lastUsableIndex(series: PriceSeries): number {
  for (let i = series.closes.length - 1; i >= 0; i--) {
    const close = series.closes[i]
    if (close !== null && Number.isFinite(close) && close > 0) {
      return i
    }
  }
  return -1
}
