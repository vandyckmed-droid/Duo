import { describe, expect, it } from 'vitest'
import { estimateMarketModel } from '../calculations/index.ts'
import {
  BENCHMARK_HISTORY,
  PRICE_HISTORY,
  STOCKS,
} from '../data/index.ts'
import {
  STOCK_CLOSES,
  TRADING_DATES,
} from '../data/priceSeries.generated.ts'
import type { StockTicker } from '../data/index.ts'
import type { PricePoint } from '../data/types.ts'
import { betaMetric } from './beta.ts'
import { rankStocks } from './rank.ts'
import { twelveMonthReturnMetric } from './twelveMonthReturn.ts'
import type { MetricContext } from './types.ts'

/**
 * End-to-end checks against the real dataset rather than a fixture.
 *
 * Deliberately not a snapshot of tickers and numbers: the prices are meant
 * to be refreshed, and a snapshot would fail on every refresh for reasons
 * that have nothing to do with the code. These assert properties that hold
 * for any correct dataset, and cross-check the ranking against a second,
 * simpler computation done straight off the generated columns — so a break
 * in the wiring between data, calculations and metrics fails here.
 */

const CONTEXT: MetricContext = {
  priceHistory: PRICE_HISTORY,
  benchmarkHistory: BENCHMARK_HISTORY,
}

/**
 * The 12M return of a ticker, computed the short way: read its column, take
 * the last session, step back a year on the calendar, take the last session
 * at or before that, divide. No shared code with the calculation layer.
 */
function independentTwelveMonthReturn(ticker: string): number {
  const closes = STOCK_CLOSES[ticker as StockTicker]
  const sessions = TRADING_DATES.map((date, index) => ({
    date,
    close: closes[index],
  })).filter((session) => session.close !== null)

  const end = sessions[sessions.length - 1]
  const [year, monthAndDay] = [end.date.slice(0, 4), end.date.slice(5)]
  const anniversary = `${Number(year) - 1}-${monthAndDay}`
  const start = sessions.findLast((session) => session.date <= anniversary)

  if (start === undefined) {
    throw new Error(`${ticker} has less than a year of history`)
  }

  return end.close! / start.close! - 1
}

describe('ranking the real universe by 12M return', () => {
  const ranked = rankStocks(STOCKS, twelveMonthReturnMetric, CONTEXT)

  it('produces one card per stock', () => {
    expect(ranked).toHaveLength(STOCKS.length)
  })

  it('values every stock — three years of history leaves no gaps', () => {
    const unvalued = ranked.filter((row) => row.value === null)

    expect(unvalued.map((row) => row.stock.ticker)).toEqual([])
  })

  it('is ordered highest return first', () => {
    for (let index = 1; index < ranked.length; index++) {
      expect(
        ranked[index - 1].value! >= ranked[index].value!,
        `${ranked[index - 1].stock.ticker} before ${ranked[index].stock.ticker}`,
      ).toBe(true)
    }
  })

  it('agrees with a return computed directly off the generated columns', () => {
    for (const row of ranked) {
      expect(row.value, row.stock.ticker).toBeCloseTo(
        independentTwelveMonthReturn(row.stock.ticker),
        10,
      )
    }
  })

  it('renders every value as a signed percentage', () => {
    for (const row of ranked) {
      expect(row.display, row.stock.ticker).toMatch(/^[+-]?\d+\.\d%$/)
    }
  })
})

describe('the market model against the real benchmark', () => {
  it('gives the benchmark a beta of exactly one against itself', () => {
    const model = estimateMarketModel(
      BENCHMARK_HISTORY.points,
      BENCHMARK_HISTORY.points,
    )

    expect(model?.beta).toBeCloseTo(1, 12)
    expect(model?.alpha).toBeCloseTo(0, 12)
  })

  it('recovers a known beta from a series built off the real benchmark', () => {
    // A synthetic asset whose every daily return is exactly twice the
    // benchmark's, compounded off real SPY closes.
    const benchmark = BENCHMARK_HISTORY.points
    const levered: PricePoint[] = [
      { date: benchmark[0].date, adjustedClose: 100 },
    ]

    for (let index = 1; index < benchmark.length; index++) {
      const benchmarkReturn =
        benchmark[index].adjustedClose / benchmark[index - 1].adjustedClose - 1

      levered.push({
        date: benchmark[index].date,
        adjustedClose: levered[index - 1].adjustedClose * (1 + 2 * benchmarkReturn),
      })
    }

    expect(estimateMarketModel(levered, benchmark)?.beta).toBeCloseTo(2, 10)
  })

  it('fits a beta for every stock in the universe', () => {
    const ranked = rankStocks(STOCKS, betaMetric, CONTEXT)

    expect(ranked.filter((row) => row.value === null)).toEqual([])
    for (const row of ranked) {
      expect(Number.isFinite(row.value!), row.stock.ticker).toBe(true)
    }
  })

  it('uses nearly every session for each fit', () => {
    for (const stock of STOCKS) {
      const model = estimateMarketModel(
        PRICE_HISTORY[stock.ticker].points,
        BENCHMARK_HISTORY.points,
      )

      expect(model?.sampleSize, stock.ticker).toBeGreaterThanOrEqual(
        TRADING_DATES.length - 10,
      )
    }
  })
})
