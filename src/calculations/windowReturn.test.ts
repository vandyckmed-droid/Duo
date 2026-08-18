import { describe, expect, it } from 'vitest'
import type { PricePoint } from '../data/types.ts'
import { calculateWindowReturn } from './windowReturn.ts'

function points(prices: readonly number[]): readonly PricePoint[] {
  return prices.map((adjustedClose, index) => ({
    date: `2026-0${index + 1}-01`,
    adjustedClose,
  }))
}

describe('calculateWindowReturn', () => {
  it('returns a positive fraction when the window rose', () => {
    expect(calculateWindowReturn(points([100, 110, 130, 150]))).toBeCloseTo(0.5)
  })

  it('returns a negative fraction when the window fell', () => {
    expect(calculateWindowReturn(points([100, 90, 80, 75]))).toBeCloseTo(-0.25)
  })

  it('returns zero when the window is unchanged start to end', () => {
    expect(calculateWindowReturn(points([100, 120, 90, 100]))).toBe(0)
  })

  it.each([
    ['an empty window', []],
    ['a single-point window', [100]],
    ['no valid points at all', [0, NaN, -5, Infinity]],
  ])('returns null for %s (insufficient history)', (_label, prices) => {
    expect(calculateWindowReturn(points(prices))).toBeNull()
  })

  it.each([
    ['the first point', [NaN, 100, 110, 150], 0.5],
    ['the last point', [100, 110, 150, -1], 0.5],
    ['both endpoints', [0, 100, 110, 150, NaN], 0.5],
  ])(
    'falls back to the nearest valid point when %s is invalid',
    (_label, prices, expected) => {
      expect(calculateWindowReturn(points(prices))).toBeCloseTo(expected)
    },
  )
})
