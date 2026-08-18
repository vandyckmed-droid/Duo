import { describe, expect, it } from 'vitest'
import type { Stock } from '../data/types.ts'
import { NO_VALUE, rankStocks } from './rank.ts'
import type { Metric, MetricContext } from './types.ts'

const STOCKS: readonly Stock[] = [
  { ticker: 'LOW', name: 'Low Co', logo: 'low.example' },
  { ticker: 'HIGH', name: 'High Co', logo: 'high.example' },
  { ticker: 'GONE', name: 'Gone Co', logo: 'gone.example' },
  { ticker: 'MID', name: 'Mid Co', logo: 'mid.example' },
  { ticker: 'MISSING', name: 'Missing Co', logo: 'missing.example' },
]

const VALUES: Readonly<Record<string, number | null>> = {
  LOW: 1,
  HIGH: 3,
  GONE: null,
  MID: 2,
  MISSING: null,
}

/** A metric standing in for any real one — the ranking must not care which. */
function stubMetric(order: Metric['order']): Metric {
  return {
    id: 'stub',
    label: 'Stub',
    order,
    compute: (stock) => VALUES[stock.ticker] ?? null,
    format: (value) => `${value}!`,
  }
}

const CONTEXT: MetricContext = {
  priceHistory: {},
  benchmarkHistory: { points: [] },
}

describe('rankStocks', () => {
  it('ranks highest value first for a descending metric', () => {
    const ranked = rankStocks(STOCKS, stubMetric('descending'), CONTEXT)

    expect(ranked.slice(0, 3).map((r) => r.stock.ticker)).toEqual([
      'HIGH',
      'MID',
      'LOW',
    ])
  })

  it('ranks lowest value first for an ascending metric', () => {
    const ranked = rankStocks(STOCKS, stubMetric('ascending'), CONTEXT)

    expect(ranked.slice(0, 3).map((r) => r.stock.ticker)).toEqual([
      'LOW',
      'MID',
      'HIGH',
    ])
  })

  it('gives every stock a row, none dropped', () => {
    const ranked = rankStocks(STOCKS, stubMetric('descending'), CONTEXT)

    expect(ranked).toHaveLength(STOCKS.length)
    expect(new Set(ranked.map((r) => r.stock.ticker))).toEqual(
      new Set(STOCKS.map((s) => s.ticker)),
    )
  })

  it.each([['descending'], ['ascending']] as const)(
    'sorts unvalued stocks last, in their original order, when %s',
    (order) => {
      const ranked = rankStocks(STOCKS, stubMetric(order), CONTEXT)

      expect(ranked.slice(-2).map((r) => r.stock.ticker)).toEqual([
        'GONE',
        'MISSING',
      ])
    },
  )

  it("renders each value with the metric's own formatter", () => {
    const ranked = rankStocks(STOCKS, stubMetric('descending'), CONTEXT)

    expect(ranked[0]).toMatchObject({ value: 3, display: '3!' })
  })

  it('shows a placeholder rather than a formatted null', () => {
    const ranked = rankStocks(STOCKS, stubMetric('descending'), CONTEXT)

    expect(ranked.at(-1)).toMatchObject({ value: null, display: NO_VALUE })
  })

  it('does not reorder the caller’s array', () => {
    const stocks = [...STOCKS]

    rankStocks(stocks, stubMetric('descending'), CONTEXT)

    expect(stocks.map((s) => s.ticker)).toEqual(STOCKS.map((s) => s.ticker))
  })

  it('returns nothing for an empty universe', () => {
    expect(rankStocks([], stubMetric('descending'), CONTEXT)).toEqual([])
  })
})
