import type { PricePoint } from '../data/types.ts'

/**
 * A price point is usable when its `adjustedClose` is a positive finite
 * number. Real and synthetic feeds alike can carry gaps or bad values (a
 * missing close, a zero, a bad feed value), so callers need a shared way to
 * tell a usable point from one to skip past.
 *
 * Internal to the calculation layer — not part of its public surface.
 */
export function isValidPricePoint(point: PricePoint): boolean {
  return Number.isFinite(point.adjustedClose) && point.adjustedClose > 0
}
