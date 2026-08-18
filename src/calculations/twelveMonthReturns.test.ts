import { describe, expect, it } from 'vitest'
import type { Stock, StockPriceHistory } from '../data/types.ts'
import { calculateTwelveMonthReturns } from './twelveMonthReturns.ts'

const STOCKS: readonly Stock[] = [
  { ticker: 'UP', name: 'Up Co', logo: 'up.example' },
  { ticker: 'DOWN', name: 'Down Co', logo: 'down.example' },
  { ticker: 'FLAT', name: 'Flat Co', logo: 'flat.example' },
  { ticker: 'NODATA', name: 'No Data Co', logo: 'nodata.example' },
]

const HISTORY: Readonly<Record<string, StockPriceHistory>> = {
  UP: { points: [{ date: '2025-08-01', adjustedClose: 100 }, { date: '2026-08-01', adjustedClose: 200 }] },
  DOWN: { points: [{ date: '2025-08-01', adjustedClose: 100 }, { date: '2026-08-01', adjustedClose: 50 }] },
  FLAT: { points: [{ date: '2025-08-01', adjustedClose: 100 }, { date: '2026-08-01', adjustedClose: 100 }] },
  NODATA: { points: [{ date: '2025-08-01', adjustedClose: 100 }] },
}

describe('calculateTwelveMonthReturns', () => {
  it('returns one entry per stock, sorted highest return to lowest', () => {
    const result = calculateTwelveMonthReturns(STOCKS, HISTORY)

    expect(result).toHaveLength(4)
    expect(result.map((r) => r.ticker)).toEqual(['UP', 'FLAT', 'DOWN', 'NODATA'])
  })

  it('places null/missing returns at the bottom, below every valid return', () => {
    const result = calculateTwelveMonthReturns(STOCKS, HISTORY)

    expect(result.at(-1)).toEqual({ ticker: 'NODATA', twelveMonthReturn: null })
  })

  it('computes each valid return via the shared raw-return math', () => {
    const result = calculateTwelveMonthReturns(STOCKS, HISTORY)
    const byTicker = Object.fromEntries(
      result.map((r) => [r.ticker, r.twelveMonthReturn]),
    )

    expect(byTicker.UP).toBeCloseTo(1)
    expect(byTicker.DOWN).toBeCloseTo(-0.5)
    expect(byTicker.FLAT).toBe(0)
  })

  it('does not drop a stock whose ticker is missing from price history', () => {
    const stocksWithGap: readonly Stock[] = [
      ...STOCKS,
      { ticker: 'MISSING', name: 'Missing Co', logo: 'missing.example' },
    ]

    const result = calculateTwelveMonthReturns(stocksWithGap, HISTORY)

    expect(result).toHaveLength(5)
    expect(result.find((r) => r.ticker === 'MISSING')).toEqual({
      ticker: 'MISSING',
      twelveMonthReturn: null,
    })
  })
})
