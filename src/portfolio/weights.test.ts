import { describe, expect, it } from 'vitest'
import { calculateInverseVolatilityWeights, formatWeight } from './weights.ts'

describe('calculateInverseVolatilityWeights', () => {
  it('gives a single selection all the weight', () => {
    const result = calculateInverseVolatilityWeights([
      { ticker: 'AAPL', volatility: 0.3 },
    ])
    expect(result).toEqual([{ ticker: 'AAPL', weight: 1 }])
  })

  it('weights inversely: the less volatile name gets more', () => {
    // 1/0.1 = 10, 1/0.2 = 5, total 15 -> 10/15 and 5/15.
    const result = calculateInverseVolatilityWeights([
      { ticker: 'CALM', volatility: 0.1 },
      { ticker: 'WILD', volatility: 0.2 },
    ])
    const byTicker = Object.fromEntries(result.map((r) => [r.ticker, r.weight]))
    expect(byTicker.CALM).toBeCloseTo(2 / 3, 10)
    expect(byTicker.WILD).toBeCloseTo(1 / 3, 10)
  })

  it('sums to 1 across an arbitrary selection', () => {
    const result = calculateInverseVolatilityWeights([
      { ticker: 'A', volatility: 0.12 },
      { ticker: 'B', volatility: 0.34 },
      { ticker: 'C', volatility: 0.56 },
    ])
    const total = result.reduce((sum, r) => sum + (r.weight ?? 0), 0)
    expect(total).toBeCloseTo(1, 10)
  })

  it.each([
    ['null (no history)', null],
    ['zero', 0],
    ['negative', -0.1],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('excludes a selection with %s volatility, keeping its row', (_l, vol) => {
    const result = calculateInverseVolatilityWeights([
      { ticker: 'GOOD', volatility: 0.2 },
      { ticker: 'BAD', volatility: vol },
    ])
    expect(result.find((r) => r.ticker === 'BAD')).toEqual({
      ticker: 'BAD',
      weight: null,
    })
    // The excluded name does not steal from the normalization.
    expect(result.find((r) => r.ticker === 'GOOD')?.weight).toBeCloseTo(1, 10)
  })

  it('gives every selection null when none are usable', () => {
    const result = calculateInverseVolatilityWeights([
      { ticker: 'A', volatility: null },
      { ticker: 'B', volatility: 0 },
    ])
    expect(result).toEqual([
      { ticker: 'A', weight: null },
      { ticker: 'B', weight: null },
    ])
  })

  it('returns nothing for an empty selection', () => {
    expect(calculateInverseVolatilityWeights([])).toEqual([])
  })
})

describe('formatWeight', () => {
  it.each([
    [0.036, '3.6%'],
    [0.5, '50.0%'],
    [1, '100%'],
    [0.9998, '100%'],
    [0.001, '0.1%'],
    [0, '0.0%'],
  ])('formats %s as %s', (weight, expected) => {
    expect(formatWeight(weight)).toBe(expected)
  })
})
