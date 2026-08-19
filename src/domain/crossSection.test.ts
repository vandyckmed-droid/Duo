import { describe, expect, it } from 'vitest'
import { agreement, groupPercentiles, meanPercentile, percentiles } from './crossSection.ts'
import { alphaComponents, compositeScore } from './alpha.ts'
import type { SecurityRecord } from './dataset.ts'

describe('percentiles', () => {
  it('gives the best value 1 and the worst 0 for desc', () => {
    const p = percentiles([
      { id: 'a', value: 10 },
      { id: 'b', value: 20 },
      { id: 'c', value: 30 },
    ])
    expect(p.byId.get('c')).toBe(1)
    expect(p.byId.get('b')).toBe(0.5)
    expect(p.byId.get('a')).toBe(0)
  })

  it('inverts for asc so the smallest value is best', () => {
    const p = percentiles(
      [
        { id: 'calm', value: 0.1 },
        { id: 'wild', value: 0.9 },
      ],
      'asc',
    )
    expect(p.byId.get('calm')).toBe(1)
    expect(p.byId.get('wild')).toBe(0)
  })

  it('gives tied values one shared midrank percentile', () => {
    const p = percentiles([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'c', value: 2 },
      { id: 'd', value: 3 },
    ])
    expect(p.byId.get('b')).toBe(p.byId.get('c'))
    // Midrank of the tie is (1+2)/2 = 1.5 → 1.5/3 = 0.5.
    expect(p.byId.get('b')).toBeCloseTo(0.5, 10)
  })

  it('names without a value get no percentile, not a default', () => {
    const p = percentiles([
      { id: 'a', value: 1 },
      { id: 'gone', value: null },
      { id: 'b', value: 2 },
    ])
    expect(p.byId.has('gone')).toBe(false)
    expect(p.measured).toBe(2)
  })

  it('a universe of one gets the uninformative middle', () => {
    const p = percentiles([{ id: 'only', value: 5 }])
    expect(p.byId.get('only')).toBe(0.5)
  })

  it('one extreme observation cannot move anyone else', () => {
    const base = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'c', value: 3 },
    ]
    const withOutlier = [...base, { id: 'x', value: 1e9 }]
    const p = percentiles(withOutlier)
    // a, b, c keep their ordering and spacing in rank space.
    expect(p.byId.get('a')).toBe(0)
    expect(p.byId.get('b')).toBeCloseTo(1 / 3, 10)
    expect(p.byId.get('c')).toBeCloseTo(2 / 3, 10)
  })
})

describe('meanPercentile', () => {
  it('averages present values and drops missing ones', () => {
    expect(meanPercentile([0.5, null, 1])).toBeCloseTo(0.75, 10)
  })

  it('refuses with fewer than minPresent values', () => {
    expect(meanPercentile([0.9, null, null], 2)).toBeNull()
  })
})

describe('agreement', () => {
  it('counts horizons at or above the band', () => {
    expect(agreement([0.95, 0.85, 0.5, 0.81])).toEqual({ count: 3, of: 4 })
  })

  it('is null when nothing was measurable', () => {
    expect(agreement([null, undefined, null])).toBeNull()
  })

  it('reports the reduced denominator when horizons are missing', () => {
    expect(agreement([0.9, null, 0.7])).toEqual({ count: 1, of: 2 })
  })
})

describe('groupPercentiles', () => {
  it('hands every member its group standing by group median', () => {
    const p = groupPercentiles([
      { id: 'a1', group: 'hot', value: 0.5 },
      { id: 'a2', group: 'hot', value: 0.6 },
      { id: 'a3', group: 'hot', value: 0.7 },
      { id: 'b1', group: 'cold', value: -0.1 },
      { id: 'b2', group: 'cold', value: 0.0 },
      { id: 'b3', group: 'cold', value: 0.1 },
    ])
    expect(p.get('a1')).toBe(1)
    expect(p.get('a3')).toBe(1)
    expect(p.get('b2')).toBe(0)
  })

  it('a group below the minimum size provides no context', () => {
    const p = groupPercentiles([
      { id: 'lone', group: 'tiny', value: 5 },
      { id: 'a1', group: 'big', value: 1 },
      { id: 'a2', group: 'big', value: 2 },
      { id: 'a3', group: 'big', value: 3 },
    ])
    expect(p.has('lone')).toBe(false)
    expect(p.has('a1')).toBe(true)
  })

  it('the median resists one extreme member', () => {
    const p = groupPercentiles([
      { id: 'a1', group: 'steady', value: 0.2 },
      { id: 'a2', group: 'steady', value: 0.25 },
      { id: 'a3', group: 'steady', value: 0.3 },
      { id: 'b1', group: 'popped', value: 0.0 },
      { id: 'b2', group: 'popped', value: 0.05 },
      { id: 'b3', group: 'popped', value: 9.0 },
    ])
    // popped's median is 0.05 despite the 900% member, so steady leads.
    expect(p.get('a1')).toBe(1)
    expect(p.get('b1')).toBe(0)
  })
})

/** A minimal record with everything the alpha composite reads. */
function record(
  ticker: string,
  overrides: {
    returns?: Partial<Record<'12-1' | '6-1' | '3M' | '12M', number | null>>
    residual12M?: number | null
    path?: Partial<NonNullable<SecurityRecord['path']>>
    sector?: string
    industry?: string
  } = {},
): SecurityRecord {
  return {
    ticker,
    name: ticker,
    segment: '500',
    benchmark: 'SPY',
    sector: overrides.sector ?? 'Tech',
    industry: overrides.industry ?? 'Software',
    marketCap: 1e9,
    returns: { '12-1': 0.1, '6-1': 0.05, '3M': 0.02, '12M': 0.12, ...overrides.returns },
    residuals: { '12M': overrides.residual12M ?? 0.05 },
    volatility: { '1Y': 0.2 },
    returnPerVol: 0.5,
    maxDrawdown: -0.1,
    beta: 1,
    betaR2: 0.5,
    betaObservations: 700,
    last: 100,
    lastDate: '2026-08-18',
    low52: 80,
    high52: 110,
    path: {
      positiveDayShare: 0.55,
      top5Share: 0.2,
      closeToHigh: 0.95,
      timeNearHigh: 0.5,
      downsideDeviation: 0.15,
      ...overrides.path,
    },
    history: { days: 800, from: '2023-01-01', to: '2026-08-18' },
    prior: { returns: {}, residuals: {}, volatility: {}, returnPerVol: null, marketCap: null },
  } as SecurityRecord
}

describe('alphaComponents', () => {
  it('scores a uniformly strong name above a uniformly weak one', () => {
    const universe = [
      record('WIN', {
        returns: { '12-1': 0.8, '6-1': 0.4, '3M': 0.2, '12M': 0.9 },
        residual12M: 0.4,
        path: { positiveDayShare: 0.6, top5Share: 0.1, closeToHigh: 1, timeNearHigh: 0.9 },
      }),
      record('MID', {}),
      record('LOSE', {
        returns: { '12-1': -0.3, '6-1': -0.2, '3M': -0.1, '12M': -0.35 },
        residual12M: -0.2,
        path: { positiveDayShare: 0.4, top5Share: 0.9, closeToHigh: 0.5, timeNearHigh: 0 },
      }),
    ]
    const c = alphaComponents(universe)
    const win = c.get('WIN')
    const lose = c.get('LOSE')
    expect(win?.score).not.toBeNull()
    expect(lose?.score).not.toBeNull()
    expect(win?.score as number).toBeGreaterThan(c.get('MID')?.score as number)
    expect(c.get('MID')?.score as number).toBeGreaterThan(lose?.score as number)
    expect(win?.agreement).toEqual({ count: 4, of: 4 })
    expect(lose?.agreement).toEqual({ count: 0, of: 4 })
  })

  it('unbuilt families are explicitly null, never zero', () => {
    const c = alphaComponents([record('A'), record('B'), record('C')])
    const a = c.get('A')
    expect(a?.families.fundamental).toBeNull()
    expect(a?.families.quality).toBeNull()
  })

  it('a name missing its price horizons gets no price family, not a bad one', () => {
    const universe = [
      record('NEW', { returns: { '12-1': null, '6-1': null, '3M': 0.5, '12M': null } }),
      record('A'),
      record('B'),
      record('C'),
    ]
    const c = alphaComponents(universe)
    // One horizon of three is below the 2-of-3 floor.
    expect(c.get('NEW')?.families.price).toBeNull()
  })
})

describe('compositeScore', () => {
  it('renormalises weights over the present families', () => {
    // price 30 at 1.0 and trend 10 at 0.5 → (30 + 5) / 40.
    const score = compositeScore({
      price: 1,
      residual: null,
      fundamental: null,
      trend: 0.5,
      quality: null,
      industry: null,
    })
    expect(score).toBeCloseTo(35 / 40, 10)
  })

  it('refuses to be a composite of one family', () => {
    expect(
      compositeScore({
        price: 0.9,
        residual: null,
        fundamental: null,
        trend: null,
        quality: null,
        industry: null,
      }),
    ).toBeNull()
  })
})
