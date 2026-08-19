import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RANK_SPEC,
  allRankSpecs,
  parseRankMetricId,
  rankLabel,
  rankMetricId,
  rankPrior,
  rankValue,
  windowIdOf,
} from './rankSpec.ts'
import { DEFAULT_METRIC_ID, METRICS } from './metrics.ts'
import type { SecurityRecord } from './dataset.ts'

const record = (over: Partial<SecurityRecord> = {}): SecurityRecord =>
  ({
    ticker: 'T',
    name: 'T',
    segment: '500',
    benchmark: 'SPY',
    sector: 'S',
    industry: 'I',
    marketCap: 1e9,
    returns: { '12M': 0.4, '12-1': 0.3, '6M': 0.2, '6-1': 0.1 },
    residuals: { '12M': 0.2, '12-1': 0.15, '6M': 0.1, '6-1': 0.05 },
    rankVol: { '12M': 0.25, '12-1': 0.2, '6M': 0.3, '6-1': 0.35 },
    rankResidualVol: { '12M': 0.1, '12-1': 0.12, '6M': 0.15, '6-1': 0.2 },
    volatility: {},
    returnPerVol: null,
    maxDrawdown: null,
    beta: 1,
    betaR2: null,
    betaObservations: 700,
    last: 100,
    lastDate: null,
    low52: null,
    high52: null,
    history: { days: 800, from: null, to: null },
    prior: {
      returns: { '12-1': 0.25, '6M': 0.18 },
      residuals: { '12-1': 0.12 },
      volatility: {},
      returnPerVol: null,
      marketCap: null,
    },
    ...over,
  }) as SecurityRecord

describe('rank spec ids', () => {
  it('round-trips every combination', () => {
    const specs = allRankSpecs()
    expect(specs).toHaveLength(16)
    for (const spec of specs) {
      expect(parseRankMetricId(rankMetricId(spec))).toEqual(spec)
    }
    expect(new Set(specs.map(rankMetricId)).size).toBe(16)
  })

  it('keeps the ids the product has always used for raw momentum', () => {
    expect(rankMetricId({ window: '12M', skip: true, residual: false, divVol: false })).toBe('12-1')
    expect(rankMetricId({ window: '6M', skip: true, residual: false, divVol: false })).toBe('6-1')
    expect(rankMetricId({ window: '12M', skip: false, residual: false, divVol: false })).toBe('12M')
  })

  it('is not fooled by non-rank ids', () => {
    for (const id of ['volatility', 'surprise', 'market-cap', 'res-', '3M', 'res-3M', 'nonsense-v']) {
      expect(parseRankMetricId(id)).toBeNull()
    }
  })

  it('the default ranking is still 12−1', () => {
    expect(rankMetricId(DEFAULT_RANK_SPEC)).toBe('12-1')
    expect(DEFAULT_METRIC_ID).toBe('12-1')
    expect(METRICS[0]?.id).toBe('12-1')
  })
})

describe('rank labels', () => {
  it('names each methodology the way a person would', () => {
    const label = (w: '12M' | '6M', skip: boolean, res: boolean, vol: boolean) =>
      rankLabel({ window: w, skip, residual: res, divVol: vol })
    expect(label('12M', false, false, false)).toBe('12M Return')
    expect(label('12M', true, false, false)).toBe('12−1 Return')
    expect(label('12M', true, true, false)).toBe('Residual 12−1')
    expect(label('6M', false, true, true)).toBe('Residual 6M / Vol')
    expect(label('12M', true, true, true)).toBe('Residual 12−1 / Vol')
  })
})

describe('rank values', () => {
  const s = record()

  it('window and skip select the published window', () => {
    expect(windowIdOf({ window: '6M', skip: true, residual: false, divVol: false })).toBe('6-1')
    expect(rankValue({ window: '12M', skip: false, residual: false, divVol: false }, s)).toBe(0.4)
    expect(rankValue({ window: '6M', skip: true, residual: false, divVol: false }, s)).toBe(0.1)
  })

  it('residual switches the numerator to the benchmark-stripped return', () => {
    expect(rankValue({ window: '12M', skip: true, residual: true, divVol: false }, s)).toBe(0.15)
  })

  it('÷vol divides a raw return by the raw volatility of the same window', () => {
    expect(rankValue({ window: '12M', skip: true, residual: false, divVol: true }, s)).toBeCloseTo(
      0.3 / 0.2,
      12,
    )
  })

  it('residual + ÷vol uses residuals for both numerator and volatility', () => {
    expect(rankValue({ window: '12M', skip: true, residual: true, divVol: true }, s)).toBeCloseTo(
      0.15 / 0.12,
      12,
    )
  })

  it('missing pieces stay missing, never zero', () => {
    const bare = record({ rankVol: {}, rankResidualVol: {} })
    expect(rankValue({ window: '12M', skip: true, residual: false, divVol: true }, bare)).toBeNull()
    const older = record()
    delete (older as { rankVol?: unknown }).rankVol
    expect(rankValue({ window: '12M', skip: true, residual: false, divVol: true }, older)).toBeNull()
    expect(rankValue({ window: '12M', skip: true, residual: false, divVol: false }, older)).toBe(0.3)
  })

  it('priors exist for plain returns and residuals but not for ÷vol', () => {
    expect(rankPrior({ window: '12M', skip: true, residual: false, divVol: false }, s)).toBe(0.25)
    expect(rankPrior({ window: '12M', skip: true, residual: true, divVol: false }, s)).toBe(0.12)
    expect(rankPrior({ window: '12M', skip: true, residual: true, divVol: true }, s)).toBeNull()
  })
})
