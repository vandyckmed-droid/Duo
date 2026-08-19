import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { alignedDailyReturns, estimateBeta } from '../calculations/index.ts'
import { UNIVERSE, parsePriceData } from '../data/index.ts'
import { METRICS, computeMetricValues, metricById, rankValues } from './index.ts'

/**
 * Sanity checks against the committed dataset rather than a fixture.
 *
 * These assert properties, not specific tickers and numbers, so refreshing
 * prices cannot break them for reasons unrelated to the code.
 */
const priceData = parsePriceData(
  JSON.parse(readFileSync('public/data/prices.json', 'utf8')),
)
const values = computeMetricValues(UNIVERSE, priceData)

describe('the committed universe', () => {
  it('holds the benchmark outside the rankable series', () => {
    expect(priceData.benchmark.ticker).toBe('IJH')
    expect(priceData.series).not.toHaveProperty('IJH')
    expect(UNIVERSE.some((s) => s.ticker === 'IJH')).toBe(false)
  })

  it('gives the benchmark a beta of exactly 1 against itself', () => {
    const self = priceData.benchmark.series
    expect(estimateBeta(alignedDailyReturns(self, self))).toBeCloseTo(1, 12)
  })

  it('has a median beta near 1 across constituents', () => {
    const betas = Object.values(priceData.series)
      .map((s) => estimateBeta(alignedDailyReturns(s, priceData.benchmark.series)))
      .filter((b): b is number => b !== null)
      .sort((a, b) => a - b)

    // Members regressed on the index they belong to should centre on 1.
    expect(betas.length).toBeGreaterThan(350)
    expect(betas[Math.floor(betas.length / 2)]).toBeGreaterThan(0.85)
    expect(betas[Math.floor(betas.length / 2)]).toBeLessThan(1.15)
    // A plausible cross-section, not a degenerate one.
    expect(betas[0]).toBeGreaterThan(-0.5)
    expect(betas.at(-1)).toBeLessThan(4)
  })

  it('computes a residual return for all but the shortest histories', () => {
    const resid = values.filter((v) => v.values.residual !== null)
    expect(resid.length).toBeGreaterThan(UNIVERSE.length - 10)
  })

  it('ranks every constituent under every metric, dropping none', () => {
    for (const metric of METRICS) {
      const ranked = rankValues(values, metric)
      expect(ranked).toHaveLength(UNIVERSE.length)
      expect(new Set(ranked.map((r) => r.stock.ticker)).size).toBe(
        UNIVERSE.length,
      )
    }
  })

  it('leaves a stock without enough history unranked rather than last', () => {
    const ranked = rankValues(values, metricById('residual'))
    const unranked = ranked.filter((r) => r.rank === null)

    for (const row of unranked) {
      expect(row.values.residual).toBeNull()
    }
    // Unranked rows sit after every ranked one.
    const firstNull = ranked.findIndex((r) => r.rank === null)
    if (firstNull !== -1) {
      expect(ranked.slice(firstNull).every((r) => r.rank === null)).toBe(true)
    }
  })

  it('formats every real value within the width three columns allow', () => {
    // Six characters is what the column width is sized for, so this asserts
    // the budget itself rather than the slack around it.
    for (const metric of METRICS) {
      for (const row of values) {
        const value = row.values[metric.id]
        if (value !== null) {
          expect(metric.format(value).length).toBeLessThanOrEqual(6)
        }
      }
    }
  })
})
