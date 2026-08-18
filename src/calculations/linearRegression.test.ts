import { describe, expect, it } from 'vitest'
import { fitLine } from './linearRegression.ts'

describe('fitLine', () => {
  it('recovers the slope and intercept of a perfect line', () => {
    const x = [0, 1, 2, 3, 4]
    const y = x.map((value) => 3 + 2 * value)

    const fit = fitLine(x, y)

    expect(fit?.slope).toBeCloseTo(2)
    expect(fit?.intercept).toBeCloseTo(3)
    expect(fit?.sampleSize).toBe(5)
  })

  it('computes the least-squares fit for points that are not collinear', () => {
    // Hand-checked: slope 0.7, intercept 2.0.
    const fit = fitLine([1, 2, 3, 4], [2, 4, 5, 4])

    expect(fit?.slope).toBeCloseTo(0.7)
    expect(fit?.intercept).toBeCloseTo(2)
  })

  it('handles a negative relationship', () => {
    const fit = fitLine([1, 2, 3], [10, 8, 6])

    expect(fit?.slope).toBeCloseTo(-2)
    expect(fit?.intercept).toBeCloseTo(12)
  })

  it.each([
    ['series of different lengths', [1, 2, 3], [1, 2]],
    ['fewer than two pairs', [1], [1]],
    ['no pairs at all', [], []],
    ['an x series with no variance', [2, 2, 2], [1, 2, 3]],
    ['a non-finite x value', [1, NaN, 3], [1, 2, 3]],
    ['a non-finite y value', [1, 2, 3], [1, Infinity, 3]],
  ])('returns null for %s', (_label, x, y) => {
    expect(fitLine(x, y)).toBeNull()
  })
})
