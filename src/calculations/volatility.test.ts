import { describe, expect, it } from 'vitest'
import type { PriceSeries } from '../data/types.ts'
import { parseIsoDateToUtc } from './isoDate.ts'
import {
  TRADING_DAYS_PER_YEAR,
  calculateVolatility,
  dailyReturnsBetween,
  standardDeviation,
} from './volatility.ts'
import type { MonthWindow } from './windowedReturn.ts'

const TWELVE_ONE: MonthWindow = { fromMonthsAgo: 12, toMonthsAgo: 1 }

function series(entries: readonly (readonly [string, number | null])[]) {
  const sorted = [...entries].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  return {
    timestamps: sorted.map(([date]) => parseIsoDateToUtc(date) as number),
    closes: sorted.map(([, close]) => close),
  } satisfies PriceSeries
}

/** Daily closes from `from`, alternating up and down by `swing` percent. */
function oscillating(from: string, days: number, swing: number) {
  const start = parseIsoDateToUtc(from) as number
  const out: [string, number][] = []
  let price = 100
  for (let i = 0; i < days; i++) {
    out.push([new Date(start + i * 86_400_000).toISOString().slice(0, 10), price])
    price = i % 2 === 0 ? price * (1 + swing) : price / (1 + swing)
  }
  return out
}

describe('standardDeviation', () => {
  it('is zero for a constant series', () => {
    expect(standardDeviation([2, 2, 2, 2])).toBe(0)
  })

  it('is zero when there is nothing to compare', () => {
    expect(standardDeviation([5])).toBe(0)
    expect(standardDeviation([])).toBe(0)
  })

  it('uses the sample (Bessel-corrected) denominator', () => {
    // Population sd of [1,2,3,4] is ~1.118; the sample sd is ~1.291.
    expect(standardDeviation([1, 2, 3, 4])).toBeCloseTo(1.2909944, 6)
  })
})

describe('dailyReturnsBetween', () => {
  it('returns one fewer value than there are usable closes', () => {
    const s = series([
      ['2024-01-01', 100],
      ['2024-01-02', 110],
      ['2024-01-03', 121],
    ])
    expect(dailyReturnsBetween(s, 0, 2)).toHaveLength(2)
  })

  it('measures across a gap rather than inventing a move', () => {
    const s = series([
      ['2024-01-01', 100],
      ['2024-01-02', null], // halted
      ['2024-01-03', 110],
    ])
    // One return, 100 -> 110, not a fake move to or from the gap.
    expect(dailyReturnsBetween(s, 0, 2)).toEqual([expect.closeTo(0.1, 10)])
  })
})

describe('calculateVolatility', () => {
  it('is zero for a series that never moves', () => {
    const s = series(
      Array.from({ length: 400 }, (_, i): [string, number] => [
        new Date((parseIsoDateToUtc('2023-12-01') as number) + i * 86_400_000)
          .toISOString()
          .slice(0, 10),
        100,
      ]),
    )
    expect(calculateVolatility(s, TWELVE_ONE)).toBe(0)
  })

  it('grows with the size of the daily swings', () => {
    const calm = series(oscillating('2023-12-01', 400, 0.005))
    const wild = series(oscillating('2023-12-01', 400, 0.02))

    const calmVol = calculateVolatility(calm, TWELVE_ONE) as number
    const wildVol = calculateVolatility(wild, TWELVE_ONE) as number

    expect(calmVol).toBeGreaterThan(0)
    expect(wildVol).toBeGreaterThan(calmVol)
  })

  it('is annualized by the square root of the trading year', () => {
    const s = series(oscillating('2023-12-01', 400, 0.01))
    const annualized = calculateVolatility(s, TWELVE_ONE) as number

    // Recover the daily figure and check the scaling factor is applied.
    expect(annualized / Math.sqrt(TRADING_DAYS_PER_YEAR)).toBeLessThan(
      annualized,
    )
    expect(annualized).toBeGreaterThan(0)
  })

  it('returns null when the window has too few returns to be meaningful', () => {
    const s = series([
      ['2024-01-15', 100],
      ['2024-06-15', 120],
      ['2024-12-15', 150],
      ['2025-01-15', 160],
    ])
    expect(calculateVolatility(s, TWELVE_ONE)).toBeNull()
  })

  it('returns null when the series cannot cover the window', () => {
    const s = series([
      ['2024-11-01', 100],
      ['2025-01-15', 150],
    ])
    expect(calculateVolatility(s, TWELVE_ONE)).toBeNull()
  })
})
