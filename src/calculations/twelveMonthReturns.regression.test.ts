import { describe, expect, it } from 'vitest'
import { PRICE_HISTORY, STOCKS } from '../data/index.ts'
import { calculateTwelveMonthReturns } from './twelveMonthReturns.ts'

/**
 * Regression test against the real dataset (not a fixture), so a change to
 * the calculation logic that alters real output is caught even if every
 * fixture-based test above still passes.
 */
describe('calculateTwelveMonthReturns (regression against the current dataset)', () => {
  it('produces the expected ticker order and 12M returns for all 10 stocks', () => {
    const result = calculateTwelveMonthReturns(STOCKS, PRICE_HISTORY)

    expect(result.map((r) => r.ticker)).toEqual([
      'NVDA',
      'WMT',
      'AMZN',
      'GOOGL',
      'TSLA',
      'MSFT',
      'JPM',
      'AAPL',
      'META',
      'XOM',
    ])

    const byTicker = Object.fromEntries(
      result.map((r) => [r.ticker, r.twelveMonthReturn]),
    )

    expect(byTicker.NVDA).toBeCloseTo(0.6631, 3)
    expect(byTicker.WMT).toBeCloseTo(0.3472, 3)
    expect(byTicker.AMZN).toBeCloseTo(0.2956, 3)
    expect(byTicker.GOOGL).toBeCloseTo(0.2835, 3)
    expect(byTicker.TSLA).toBeCloseTo(0.256, 3)
    expect(byTicker.MSFT).toBeCloseTo(0.2093, 3)
    expect(byTicker.JPM).toBeCloseTo(0.2078, 3)
    expect(byTicker.AAPL).toBeCloseTo(0.1955, 3)
    expect(byTicker.META).toBeCloseTo(0.1836, 3)
    expect(byTicker.XOM).toBeCloseTo(-0.049, 3)
  })
})
