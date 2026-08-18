import { describe, expect, it } from 'vitest'
import type { PricePoint, Stock } from '../data/types.ts'
import { betaMetric } from './beta.ts'
import { rankStocks } from './rank.ts'
import { twelveMonthReturnMetric } from './twelveMonthReturn.ts'
import type { MetricContext } from './types.ts'

function dateAt(index: number): string {
  return new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10)
}

function toPoints(
  returns: readonly number[],
  start: number,
): readonly PricePoint[] {
  const points: PricePoint[] = [{ date: dateAt(0), adjustedClose: start }]

  for (const [index, periodReturn] of returns.entries()) {
    points.push({
      date: dateAt(index + 1),
      adjustedClose: points[index].adjustedClose * (1 + periodReturn),
    })
  }

  return points
}

const BENCHMARK_RETURNS = Array.from(
  { length: 400 },
  (_unused, index) => Math.sin(index) / 100,
)

const CONTEXT: MetricContext = {
  priceHistory: {
    STEADY: {
      points: [
        { date: '2025-01-15', adjustedClose: 100 },
        { date: '2026-01-15', adjustedClose: 125 },
      ],
    },
    SHORT: { points: [{ date: '2026-01-15', adjustedClose: 100 }] },
    AMPLIFIED: {
      points: toPoints(
        BENCHMARK_RETURNS.map((benchmarkReturn) => 1.5 * benchmarkReturn),
        80,
      ),
    },
  },
  benchmarkHistory: { points: toPoints(BENCHMARK_RETURNS, 400) },
}

function stock(ticker: string): Stock {
  return { ticker, name: `${ticker} Co`, logo: `${ticker.toLowerCase()}.example` }
}

describe('twelveMonthReturnMetric', () => {
  it('values a stock by its trailing 12-month return', () => {
    expect(twelveMonthReturnMetric.compute(stock('STEADY'), CONTEXT)).toBeCloseTo(
      0.25,
    )
  })

  it('formats as a signed percentage', () => {
    expect(twelveMonthReturnMetric.format(0.25)).toBe('+25.0%')
  })

  it('values a stock with too little history as null, not zero', () => {
    expect(twelveMonthReturnMetric.compute(stock('SHORT'), CONTEXT)).toBeNull()
  })

  it('values a stock missing from the price history as null', () => {
    expect(twelveMonthReturnMetric.compute(stock('ABSENT'), CONTEXT)).toBeNull()
  })
})

describe('betaMetric', () => {
  it('values a stock by its beta against the benchmark', () => {
    expect(betaMetric.compute(stock('AMPLIFIED'), CONTEXT)).toBeCloseTo(1.5, 6)
  })

  it('formats as a two-decimal ratio', () => {
    expect(betaMetric.format(1.2837)).toBe('1.28')
  })

  it('values a stock with too little overlap as null', () => {
    expect(betaMetric.compute(stock('STEADY'), CONTEXT)).toBeNull()
  })
})

describe('metric interchangeability', () => {
  /**
   * The point of the whole seam: the same universe, the same context and the
   * same ranking function produce a different ranking purely by swapping the
   * metric object. Nothing but the metric changes between these two calls.
   */
  it('reranks the same universe from the same data when the metric changes', () => {
    const universe = [stock('STEADY'), stock('AMPLIFIED')]

    const byReturn = rankStocks(universe, twelveMonthReturnMetric, CONTEXT)
    const byBeta = rankStocks(universe, betaMetric, CONTEXT)

    expect(byReturn.map((r) => r.stock.ticker)).toEqual(['STEADY', 'AMPLIFIED'])
    expect(byReturn[0].display).toBe('+25.0%')

    expect(byBeta.map((r) => r.stock.ticker)).toEqual(['AMPLIFIED', 'STEADY'])
    expect(byBeta[0].display).toBe('1.50')
  })
})
