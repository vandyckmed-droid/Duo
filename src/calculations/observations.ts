import type { PricePoint } from '../data/types.ts'
import type { PriceObservation } from './priceObservation.ts'
import { toPriceObservation } from './priceObservation.ts'

/**
 * Normalises a raw price history into observations that are safe to compute
 * on: unusable points dropped, duplicate dates collapsed, and ordered oldest
 * to newest.
 *
 * Sorting here is what lets every consumer stop caring how the caller
 * ordered its input — some feeds return newest-first — and duplicate dates
 * are collapsed to the last point seen for that date, because a series with
 * two prices for one session would otherwise produce a phantom zero-length
 * return when consecutive returns are taken.
 */
export function toObservations(
  points: readonly PricePoint[],
): readonly PriceObservation[] {
  const byTimestamp = new Map<number, PriceObservation>()

  for (const point of points) {
    const observation = toPriceObservation(point)
    if (observation !== null) {
      byTimestamp.set(observation.timestamp, observation)
    }
  }

  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp)
}
