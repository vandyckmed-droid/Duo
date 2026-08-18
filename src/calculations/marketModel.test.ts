import { describe, expect, it } from 'vitest'
import type { PricePoint } from '../data/types.ts'
import { estimateMarketModel } from './marketModel.ts'

/** Consecutive calendar dates, so the fixtures read as a daily series. */
function dateAt(index: number): string {
  return new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10)
}

/** Compounds a return series into a price series starting at `start`. */
function toPoints(
  returns: readonly number[],
  start: number,
): readonly PricePoint[] {
  const points: PricePoint[] = [{ date: dateAt(0), adjustedClose: start }]

  for (const [index, periodReturn] of returns.entries()) {
    points.push({
      date: dateAt(index + 1),
      adjustedClose: points[index].adjustedClose * (1 + periodReturn),
    })
  }

  return points
}

/** Deterministic, varied benchmark returns — no randomness in fixtures. */
const BENCHMARK_RETURNS = Array.from(
  { length: 200 },
  (_unused, index) => Math.sin(index) / 100,
)
const BENCHMARK = toPoints(BENCHMARK_RETURNS, 400)

/** An asset whose returns are exactly `alpha + beta · benchmarkReturn`. */
function assetFor(beta: number, alpha: number): readonly PricePoint[] {
  return toPoints(
    BENCHMARK_RETURNS.map((benchmarkReturn) => alpha + beta * benchmarkReturn),
    100,
  )
}

describe('estimateMarketModel', () => {
  it.each([
    ['an amplifying stock', 1.6, 0.0004],
    ['a damping stock', 0.45, -0.0002],
    ['a stock that tracks the market exactly', 1, 0],
    ['an inversely exposed stock', -0.8, 0.0001],
  ])('recovers beta and alpha for %s', (_label, beta, alpha) => {
    const model = estimateMarketModel(assetFor(beta, alpha), BENCHMARK)

    expect(model?.beta).toBeCloseTo(beta, 6)
    expect(model?.alpha).toBeCloseTo(alpha, 6)
  })

  it('reports how many aligned periods the fit used', () => {
    const model = estimateMarketModel(assetFor(1.2, 0), BENCHMARK)

    expect(model?.sampleSize).toBe(BENCHMARK_RETURNS.length)
  })

  it('uses only periods the asset and the benchmark share', () => {
    const asset = assetFor(1.2, 0).slice(0, 100)

    const model = estimateMarketModel(asset, BENCHMARK)

    expect(model?.sampleSize).toBe(99)
    expect(model?.beta).toBeCloseTo(1.2, 6)
  })

  it('returns null when the histories share fewer than the minimum periods', () => {
    const asset = assetFor(1.2, 0).slice(0, 40)

    expect(estimateMarketModel(asset, BENCHMARK)).toBeNull()
  })

  it('accepts a caller-supplied minimum', () => {
    const asset = assetFor(1.2, 0).slice(0, 40)

    expect(estimateMarketModel(asset, BENCHMARK, 10)?.beta).toBeCloseTo(1.2, 6)
  })

  it('returns null when the benchmark never moved, so beta is undefined', () => {
    const flat = toPoints(
      BENCHMARK_RETURNS.map(() => 0),
      400,
    )

    expect(estimateMarketModel(assetFor(1.2, 0), flat)).toBeNull()
  })

  it('returns null when there is no overlap to fit', () => {
    expect(estimateMarketModel([], BENCHMARK)).toBeNull()
  })
})
