import type { PricePoint } from '../data/types.ts'
import { isValidPricePoint } from './pricePointValidity.ts'
import { calculateRawReturn } from './rawReturn.ts'

/**
 * Raw return across a price-history window, from its first valid point to
 * its last valid point.
 *
 * A point is valid when its `adjustedClose` is a positive finite number.
 * Real and synthetic feeds alike can carry unusable points (a missing close,
 * a bad feed value), so the window's first and last *array* entries are not
 * necessarily its usable endpoints — this searches inward from both ends
 * rather than assuming the boundary entries are safe to read directly.
 * Reuses `calculateRawReturn` for the return math itself.
 *
 * Returns `null` when the window has fewer than two valid points to compare
 * — an empty or single-point window, or one where every point is unusable.
 */
export function calculateWindowReturn(
  points: readonly PricePoint[],
): number | null {
  const first = points.find(isValidPricePoint)
  const last = points.findLast(isValidPricePoint)

  if (!first || !last || first === last) {
    return null
  }

  return calculateRawReturn(first.adjustedClose, last.adjustedClose)
}
