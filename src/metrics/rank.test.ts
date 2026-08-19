import { describe, expect, it } from 'vitest'
import type { PriceData, Stock } from '../data/types.ts'
import { parseIsoDateToUtc } from '../calculations/index.ts'
import type { Metric } from './types.ts'
import { computeMetricValues, rankValues } from './rank.ts'
import type { MetricValues } from './rank.ts'

const STOCKS: readonly Stock[] = [
  { ticker: 'AAA', name: 'Alpha', sector: 'Tech' },
  { ticker: 'BBB', name: 'Beta', sector: 'Tech' },
  { ticker: 'CCC', name: 'Gamma', sector: 'Energy' },
  { ticker: 'NEW', name: 'Newly Listed', sector: 'Energy' },
]

const timestamps = ['2024-01-01', '2025-01-01'].map(
  (d) => parseIsoDateToUtc(d) as number,
)

const priceData: PriceData = {
  generatedAt: '2025-01-01',
  timestamps,
  benchmark: {
    ticker: 'IJH',
    series: { timestamps, closes: [100, 150] },
  },
  series: {
    AAA: { timestamps, closes: [100, 300] },
    BBB: { timestamps, closes: [100, 200] },
    CCC: { timestamps, closes: [100, 50] },
    NEW: { timestamps, closes: [null, 120] },
  },
}

/** Ranks purely on the last close, so expectations stay obvious. */
const lastClose: Metric = {
  id: 'last',
  label: 'Last',
  shortLabel: 'LAST',
  description: 'Last close.',
  compute: (series) => series.closes.at(-1) ?? null,
  format: (v) => String(v),
  direction: 'desc',
  signed: false,
}

/** Never computes, to exercise the all-unrankable path. */
const missing: Metric = { ...lastClose, id: 'missing', compute: () => null }

const firstClose: Metric = {
  ...lastClose,
  id: 'first',
  compute: (series) => series.closes[0],
}

/** Computes then orders, the two steps the app performs separately. */
function rank(
  stocks: readonly Stock[],
  sortBy: Metric,
  metrics: readonly Metric[],
) {
  return rankValues(computeMetricValues(stocks, priceData, metrics), sortBy)
}

describe('rankValues', () => {
  it('orders descending and numbers the ranks from one', () => {
    const result = rank(STOCKS, lastClose, [lastClose])

    expect(result.map((r: MetricValues) => r.stock.ticker)).toEqual([
      'AAA',
      'BBB',
      'NEW',
      'CCC',
    ])
    expect(result.map((r: { rank: number | null }) => r.rank)).toEqual([1, 2, 3, 4])
  })

  it('orders ascending when the metric ranks smallest first', () => {
    const ascending: Metric = { ...lastClose, direction: 'asc' }
    const result = rank(STOCKS, ascending, [ascending])

    expect(result.map((r: MetricValues) => r.stock.ticker)).toEqual([
      'CCC',
      'NEW',
      'BBB',
      'AAA',
    ])
  })

  it('sends stocks the metric cannot measure to the bottom, unranked', () => {
    const result = rank(STOCKS, firstClose, [firstClose])

    expect(result.at(-1)?.stock.ticker).toBe('NEW')
    expect(result.at(-1)?.rank).toBeNull()
    // A missing measurement is not last place; it carries no rank at all.
    expect(result.slice(0, 3).every((r: { rank: number | null }) => typeof r.rank === 'number')).toBe(
      true,
    )
  })

  it('computes every metric, not only the one being sorted by', () => {
    const result = rank(STOCKS, lastClose, [lastClose, firstClose])

    expect(result[0].values).toEqual({ last: 300, first: 100 })
  })

  it('keeps every stock when no stock can be measured', () => {
    const result = rank(STOCKS, missing, [missing])

    expect(result).toHaveLength(STOCKS.length)
    expect(result.every((r: { rank: number | null }) => r.rank === null)).toBe(true)
    expect(result.map((r: MetricValues) => r.stock.ticker)).toEqual([
      'AAA',
      'BBB',
      'CCC',
      'NEW',
    ])
  })

  it('gives a stock with no price history null values rather than dropping it', () => {
    const orphan: Stock = { ticker: 'GONE', name: 'No Data', sector: 'Tech' }
    const result = rank([...STOCKS, orphan], lastClose, [lastClose])

    expect(result).toHaveLength(5)
    expect(result.find((r: MetricValues) => r.stock.ticker === 'GONE')).toMatchObject({
      rank: null,
      values: { last: null },
    })
  })
})
