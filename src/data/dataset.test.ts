import { describe, expect, it } from 'vitest'
import { BENCHMARK, BENCHMARK_HISTORY, LAST_TRADING_DATE, PRICE_HISTORY, STOCKS } from './index.ts'
import { TRADING_DATES } from './priceSeries.generated.ts'
import type { StockPriceHistory } from './types.ts'

/**
 * Integrity of the committed dataset.
 *
 * The prices are fetched by a script and pasted in as a generated file, so
 * nothing about them is guaranteed by the type system beyond "a stock has a
 * column". These assertions are what stands between a bad fetch — a
 * truncated series, a rate-limited symbol that came back near-empty, a
 * misaligned grid — and a silently wrong ranking.
 */

/** Three years of US sessions, with room for holidays either way. */
const MINIMUM_SESSIONS = 700

function everyHistory(): readonly (readonly [string, StockPriceHistory])[] {
  return [
    ...STOCKS.map(
      (stock) => [stock.ticker, PRICE_HISTORY[stock.ticker]] as const,
    ),
    [BENCHMARK.ticker, BENCHMARK_HISTORY] as const,
  ]
}

describe('the universe', () => {
  it('holds roughly the fifty largest S&P 500 companies', () => {
    expect(STOCKS.length).toBe(50)
  })

  it('has no duplicate tickers', () => {
    expect(new Set(STOCKS.map((s) => s.ticker)).size).toBe(STOCKS.length)
  })

  it('gives every stock a name and a logo reference', () => {
    for (const stock of STOCKS) {
      expect(stock.name.length, stock.ticker).toBeGreaterThan(0)
      expect(stock.logo, stock.ticker).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/)
    }
  })

  it('keeps the benchmark out of the ranked universe', () => {
    expect(STOCKS.map((s) => s.ticker)).not.toContain(BENCHMARK.ticker)
  })
})

describe('the trading-date grid', () => {
  it('covers about three years of sessions', () => {
    expect(TRADING_DATES.length).toBeGreaterThanOrEqual(MINIMUM_SESSIONS)
  })

  it('is strictly ascending, so it carries no duplicate session', () => {
    for (let index = 1; index < TRADING_DATES.length; index++) {
      expect(TRADING_DATES[index] > TRADING_DATES[index - 1]).toBe(true)
    }
  })

  it('holds only ISO calendar dates', () => {
    for (const date of TRADING_DATES) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('spans at least three calendar years', () => {
    const first = new Date(`${TRADING_DATES[0]}T00:00:00Z`).getTime()
    const last = new Date(`${LAST_TRADING_DATE}T00:00:00Z`).getTime()
    const years = (last - first) / (365.25 * 24 * 60 * 60 * 1000)

    expect(years).toBeGreaterThanOrEqual(2.9)
  })

  it('ends on the last session the app reports', () => {
    expect(LAST_TRADING_DATE).toBe(TRADING_DATES.at(-1))
  })
})

describe('every price history', () => {
  it('carries enough sessions for a three-year regression', () => {
    for (const [ticker, history] of everyHistory()) {
      expect(history.points.length, ticker).toBeGreaterThanOrEqual(
        MINIMUM_SESSIONS,
      )
    }
  })

  it('holds only positive finite closes', () => {
    for (const [ticker, history] of everyHistory()) {
      for (const point of history.points) {
        expect(Number.isFinite(point.adjustedClose), `${ticker} ${point.date}`).toBe(true)
        expect(point.adjustedClose, `${ticker} ${point.date}`).toBeGreaterThan(0)
      }
    }
  })

  it('is ordered oldest first with no repeated date', () => {
    for (const [ticker, history] of everyHistory()) {
      const dates = history.points.map((point) => point.date)

      expect(dates, ticker).toEqual([...dates].sort())
      expect(new Set(dates).size, ticker).toBe(dates.length)
    }
  })

  it('only ever falls on a session in the shared grid', () => {
    const grid = new Set(TRADING_DATES)

    for (const [ticker, history] of everyHistory()) {
      for (const point of history.points) {
        expect(grid.has(point.date), `${ticker} ${point.date}`).toBe(true)
      }
    }
  })
})
