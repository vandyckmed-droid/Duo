import type { Stock } from './types.ts'

/**
 * Every sector present in a universe, in alphabetical order.
 *
 * Derived from the constituents rather than hard-coded: the sector list is a
 * property of whatever dataset is loaded, so a reclassification or a change
 * of index shows up here without a second thing to keep in sync. Sectors
 * with no constituents never appear, so the filter can never offer an option
 * that returns nothing.
 */
export function sectorsIn(stocks: readonly Stock[]): readonly string[] {
  return [...new Set(stocks.map((stock) => stock.sector))].sort()
}

/**
 * Resolves a requested sector against the ones that exist, or `null`.
 *
 * `null` means "no filter", and so does anything unrecognised. The sector
 * comes from the URL, where it can be stale, hand-edited or left over from
 * an older dataset; showing the whole index is a better answer to that than
 * an empty list.
 */
export function resolveSector(
  sectors: readonly string[],
  requested: string | null | undefined,
): string | null {
  if (!requested) return null
  return sectors.includes(requested) ? requested : null
}
