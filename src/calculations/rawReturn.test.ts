import { describe, expect, it } from 'vitest'
import { calculateRawReturn } from './rawReturn.ts'

describe('calculateRawReturn', () => {
  it('returns a positive fraction when the price rose', () => {
    expect(calculateRawReturn(100, 150)).toBeCloseTo(0.5)
  })

  it('returns a negative fraction when the price fell', () => {
    expect(calculateRawReturn(100, 75)).toBeCloseTo(-0.25)
  })

  it('returns zero when the price is unchanged', () => {
    expect(calculateRawReturn(100, 100)).toBe(0)
  })

  it.each([
    ['zero start price', 0, 100],
    ['negative start price', -10, 100],
    ['zero end price', 100, 0],
    ['negative end price', 100, -10],
    ['NaN start price', NaN, 100],
    ['Infinity end price', 100, Infinity],
  ])('returns null for %s instead of NaN/Infinity', (_label, start, end) => {
    expect(calculateRawReturn(start, end)).toBeNull()
  })
})
