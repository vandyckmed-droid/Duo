import { describe, expect, it } from 'vitest'
import type { SecurityRecord } from '../domain/dataset.ts'
import { BLENDED_MOMENTUM, type RankSpec, rankUniverse } from './ranking.ts'
import { dailyReturns, endpointAt, lastValidIndex, priceRange } from './series.ts'
import {
  SIGNAL_WINDOWS,
  formationVolatility,
  momentumSignal,
  windowReturn,
} from './signals.ts'
import { mean, stdev, zScores } from './stats.ts'

/** A steady-growth series: close on day i is 100 · (1 + rate)^i. */
function growth(days: number, rate: number): number[] {
  return Array.from({ length: days }, (_, i) => 100 * (1 + rate) ** i)
}

describe('series', () => {
  it('finds the last usable close, skipping gaps and junk', () => {
    expect(lastValidIndex([100, null, 101, null, null])).toBe(2)
    expect(lastValidIndex([null, 0, -5, Number.NaN])).toBe(-1)
  })

  it('pulls an endpoint back within tolerance, never forward', () => {
    const closes = [100, null, null, 103, null, null, null, null, null, null]
    expect(endpointAt(closes, 5)).toEqual({ index: 3, close: 103 })
    // The only usable close after index 3 is out of reach going backwards.
    expect(endpointAt(closes, 9, 5)).toBeNull()
    expect(endpointAt(closes, 42)).toBeNull()
  })

  it('books no daily return across a gap', () => {
    const returns = dailyReturns([100, 110, null, 120, 126])
    expect(returns[1]).toBeCloseTo(0.1)
    expect(returns[2]).toBeNull()
    expect(returns[3]).toBeNull()
    expect(returns[4]).toBeCloseTo(0.05)
  })

  it('reports the 52-week style range over the trailing lookback only', () => {
    // 300 days: an early spike to 500 falls outside a 252-day lookback.
    const closes = [...growth(48, 0).map((_, i) => (i === 10 ? 500 : 100)), ...growth(252, 0.001)]
    const range = priceRange(closes, 252)
    expect(range).not.toBeNull()
    expect(range?.high).toBeCloseTo(100 * 1.001 ** 251)
    expect(range?.low).toBeCloseTo(100)
    expect(range?.last).toBeCloseTo(100 * 1.001 ** 251)
  })

  it('refuses a range built from a handful of prints', () => {
    const closes = [...Array.from({ length: 250 }, () => null), 100, 101]
    expect(priceRange(closes, 252)).toBeNull()
  })
})

describe('stats', () => {
  it('computes mean and sample standard deviation', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3)
    expect(stdev([1])).toBeNull()
  })

  it('z-scores a cross-section to mean 0, sd 1', () => {
    const z = zScores([1, 2, 3, 4, 5])
    expect(mean(z)).toBeCloseTo(0)
    expect(stdev(z) as number).toBeCloseTo(1)
    expect(z[4]).toBeGreaterThan(z[0] as number)
  })

  it('normalises a degenerate cross-section to zeros', () => {
    expect(zScores([3, 3, 3])).toEqual([0, 0, 0])
    expect(zScores([])).toEqual([])
  })
})

describe('signals', () => {
  const twelveOne = SIGNAL_WINDOWS['12-1'] as { formation: number; skip: number }
  const sixOne = SIGNAL_WINDOWS['6-1'] as { formation: number; skip: number }

  it('measures the 12−1 window: a year of formation ending a month back', () => {
    const rate = 0.001
    const closes = growth(300, rate)
    const r = windowReturn(closes, twelveOne)
    // 252 daily steps of compounding, regardless of what the skipped month did.
    expect(r).toBeCloseTo((1 + rate) ** 252 - 1, 10)
  })

  it('excludes the latest month from the measured period', () => {
    // Flat for a year, then a huge final month: 12−1 must not see it.
    const closes = [...growth(280, 0), ...growth(21, 0.05)]
    expect(windowReturn(closes, twelveOne)).toBeCloseTo(0, 10)
    expect(windowReturn(closes, sixOne)).toBeCloseTo(0, 10)
  })

  it('returns null rather than shortening a window it cannot fill', () => {
    expect(windowReturn(growth(200, 0.001), twelveOne)).toBeNull()
    expect(windowReturn(growth(100, 0.001), sixOne)).toBeNull()
  })

  it('measures volatility over the formation span, not the skipped month', () => {
    // Perfectly steady through the formation window, wild in the last month.
    const steady = growth(280, 0.001)
    const wild = [...steady]
    for (let i = 0; i < 21; i++) {
      wild.push((wild.at(-1) as number) * (i % 2 === 0 ? 1.1 : 0.92))
    }
    const vol = formationVolatility(wild, twelveOne)
    expect(vol).not.toBeNull()
    expect(vol as number).toBeLessThan(1e-6)
  })

  it('refuses volatility from a window with too little coverage', () => {
    const sparse: (number | null)[] = growth(300, 0.001).map((c, i) => (i % 3 === 0 ? c : null))
    expect(formationVolatility(sparse, twelveOne)).toBeNull()
  })

  it('adjusts momentum by volatility and never divides by zero', () => {
    const drift = growth(300, 0.001)
    const calm = drift.map((c, i) => c * (1 + (i % 2 === 0 ? 0.001 : -0.001)))
    const noisy = drift.map((c, i) => c * (1 + (i % 2 === 0 ? 0.02 : -0.02)))
    const calmSignal = momentumSignal(calm, sixOne)
    const noisySignal = momentumSignal(noisy, sixOne)
    // A flat series has zero volatility → no signal rather than infinity.
    expect(momentumSignal(growth(300, 0), sixOne)).toBeNull()
    expect(calmSignal).not.toBeNull()
    expect(noisySignal).not.toBeNull()
    // Same drift, more noise → smaller volatility-adjusted signal.
    expect(Math.abs(noisySignal as number)).toBeLessThan(Math.abs(calmSignal as number))
  })
})

function record(ticker: string, signals: Record<string, number>): SecurityRecord {
  return {
    ticker,
    name: ticker,
    segment: '500',
    sector: 'Industrials',
    signals,
    last: 100,
    lastDate: '2026-08-18',
    low52: 80,
    high52: 120,
  }
}

describe('ranking', () => {
  it('blends z-normalised signals 50/50 and ranks highest first', () => {
    const universe = [
      record('AAA', { '12-1': 3, '6-1': 0 }),
      record('BBB', { '12-1': 0, '6-1': 3 }),
      record('CCC', { '12-1': 2, '6-1': 2 }),
      record('DDD', { '12-1': -1, '6-1': -1 }),
    ]
    const ranked = rankUniverse(universe, BLENDED_MOMENTUM)
    expect(ranked.map((r) => r.security.ticker)).toEqual(['CCC', 'AAA', 'BBB', 'DDD'])
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    // AAA and BBB are symmetric across the two signals: identical blends.
    expect(ranked[1]?.score).toBeCloseTo(ranked[2]?.score as number)
    // Normalised blend: scores centre on zero across the universe.
    expect(mean(ranked.map((r) => r.score))).toBeCloseTo(0)
  })

  it('breaks exact ties by ticker so the order is total', () => {
    const universe = [record('ZZZ', { '12-1': 1, '6-1': 1 }), record('MMM', { '12-1': 1, '6-1': 1 })]
    const ranked = rankUniverse(universe, BLENDED_MOMENTUM)
    expect(ranked.map((r) => r.security.ticker)).toEqual(['MMM', 'ZZZ'])
  })

  it('drops records missing a signal the spec asks for', () => {
    const universe = [record('AAA', { '12-1': 1, '6-1': 1 }), record('BBB', { '12-1': 1 })]
    expect(rankUniverse(universe, BLENDED_MOMENTUM)).toHaveLength(1)
  })

  it('supports alternative weightings without new machinery', () => {
    const longOnly: RankSpec = {
      id: 'long-horizon',
      label: '12−1 only',
      components: [{ signal: '12-1', weight: 1 }],
    }
    const universe = [
      record('AAA', { '12-1': 3, '6-1': -5 }),
      record('BBB', { '12-1': 1, '6-1': 5 }),
    ]
    const ranked = rankUniverse(universe, longOnly)
    expect(ranked[0]?.security.ticker).toBe('AAA')
  })
})
