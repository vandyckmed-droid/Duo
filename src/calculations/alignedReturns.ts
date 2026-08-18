import type { PricePoint } from '../data/types.ts'
import { toObservations } from './observations.ts'
import { calculateRawReturn } from './rawReturn.ts'

/** One period's return on an asset and on the benchmark, over the same dates. */
export interface ReturnPair {
  /** Timestamp of the session the period ends on. */
  readonly timestamp: number
  /** The asset's return over the period. */
  readonly assetReturn: number
  /** The benchmark's return over the same period. */
  readonly benchmarkReturn: number
}

/**
 * Contemporaneous returns for an asset and a benchmark, one pair per period
 * both actually traded.
 *
 * Prices are aligned *before* returns are taken, not after. That ordering is
 * the whole point: if the asset did not trade on a session the benchmark
 * did, taking returns first would pair the asset's two-day return with the
 * benchmark's one-day return and quietly inflate the relationship between
 * them. Aligning first makes both legs of every pair span exactly the same
 * calendar period, however long that period happens to be.
 *
 * Returns an empty array when the two series share fewer than two sessions —
 * there is no period to measure.
 */
export function calculateAlignedReturns(
  assetPoints: readonly PricePoint[],
  benchmarkPoints: readonly PricePoint[],
): readonly ReturnPair[] {
  const benchmarkByTimestamp = new Map(
    toObservations(benchmarkPoints).map((observation) => [
      observation.timestamp,
      observation.adjustedClose,
    ]),
  )

  const aligned: {
    timestamp: number
    assetPrice: number
    benchmarkPrice: number
  }[] = []

  for (const observation of toObservations(assetPoints)) {
    const benchmarkPrice = benchmarkByTimestamp.get(observation.timestamp)
    if (benchmarkPrice !== undefined) {
      aligned.push({
        timestamp: observation.timestamp,
        assetPrice: observation.adjustedClose,
        benchmarkPrice,
      })
    }
  }

  const pairs: ReturnPair[] = []

  for (let index = 1; index < aligned.length; index++) {
    const previous = aligned[index - 1]
    const current = aligned[index]

    const assetReturn = calculateRawReturn(
      previous.assetPrice,
      current.assetPrice,
    )
    const benchmarkReturn = calculateRawReturn(
      previous.benchmarkPrice,
      current.benchmarkPrice,
    )

    if (assetReturn !== null && benchmarkReturn !== null) {
      pairs.push({ timestamp: current.timestamp, assetReturn, benchmarkReturn })
    }
  }

  return pairs
}
