import { describe, expect, it } from 'vitest'
import type { PricePoint } from '../data/types.ts'
import { calculateAlignedReturns } from './alignedReturns.ts'

function series(
  entries: readonly (readonly [string, number])[],
): readonly PricePoint[] {
  return entries.map(([date, adjustedClose]) => ({ date, adjustedClose }))
}

const BENCHMARK = series([
  ['2024-01-01', 100],
  ['2024-01-02', 110],
  ['2024-01-03', 121],
])

describe('calculateAlignedReturns', () => {
  it('pairs one return per period both series traded', () => {
    const asset = series([
      ['2024-01-01', 50],
      ['2024-01-02', 60],
      ['2024-01-03', 66],
    ])

    const pairs = calculateAlignedReturns(asset, BENCHMARK)

    expect(pairs).toHaveLength(2)
    expect(pairs[0].assetReturn).toBeCloseTo(0.2)
    expect(pairs[0].benchmarkReturn).toBeCloseTo(0.1)
    expect(pairs[1].assetReturn).toBeCloseTo(0.1)
    expect(pairs[1].benchmarkReturn).toBeCloseTo(0.1)
  })

  it('ignores sessions only one of the two series traded', () => {
    const asset = series([
      ['2023-12-29', 40], // before the benchmark's history
      ['2024-01-01', 50],
      ['2024-01-02', 60],
      ['2024-01-04', 99], // after the benchmark's history
    ])

    const pairs = calculateAlignedReturns(asset, BENCHMARK)

    expect(pairs).toHaveLength(1)
    expect(pairs[0].assetReturn).toBeCloseTo(0.2)
    expect(pairs[0].benchmarkReturn).toBeCloseTo(0.1)
  })

  it('spans a gap on both legs rather than pairing periods of unequal length', () => {
    // The asset did not trade on 2024-01-02. Its return must be measured
    // 01-01 → 01-03, and so must the benchmark's — not 01-02 → 01-03.
    const asset = series([
      ['2024-01-01', 50],
      ['2024-01-03', 60],
    ])

    const pairs = calculateAlignedReturns(asset, BENCHMARK)

    expect(pairs).toHaveLength(1)
    expect(pairs[0].assetReturn).toBeCloseTo(0.2)
    expect(pairs[0].benchmarkReturn).toBeCloseTo(0.21) // 121/100 - 1, not 121/110 - 1
  })

  it('gives the same pairs regardless of how either series was ordered', () => {
    const asset = series([
      ['2024-01-02', 60],
      ['2024-01-01', 50],
      ['2024-01-03', 66],
    ])

    const pairs = calculateAlignedReturns(asset, [...BENCHMARK].reverse())

    expect(pairs.map((pair) => pair.assetReturn.toFixed(4))).toEqual([
      '0.2000',
      '0.1000',
    ])
  })

  it('skips unusable points on either side', () => {
    const asset = series([
      ['2024-01-01', 50],
      ['2024-01-02', NaN],
      ['2024-01-03', 60],
    ])

    const pairs = calculateAlignedReturns(asset, BENCHMARK)

    expect(pairs).toHaveLength(1)
    expect(pairs[0].assetReturn).toBeCloseTo(0.2)
  })

  it.each([
    ['no overlap at all', series([['2025-06-01', 10], ['2025-06-02', 11]])],
    ['a single shared session', series([['2024-01-02', 10]])],
    ['an empty series', series([])],
  ])('returns no pairs for %s', (_label, asset) => {
    expect(calculateAlignedReturns(asset, BENCHMARK)).toEqual([])
  })
})
