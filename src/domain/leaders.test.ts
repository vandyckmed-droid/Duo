import { describe, expect, it } from 'vitest'
import { cashAmounts, sectorLeaders } from './leaders.ts'
import type { SecurityRecord } from './dataset.ts'
import { GICS_SECTORS } from './sectors.ts'
import { SEGMENTS } from './segments.ts'

const make = (
  ticker: string,
  segment: string,
  sector: string,
  r12: number | null,
  r6: number | null,
): SecurityRecord =>
  ({
    ticker,
    name: ticker,
    segment,
    benchmark: 'SPY',
    sector,
    industry: 'I',
    marketCap: 1e9,
    returns: { '12-1': r12, '6-1': r6 },
    residuals: {},
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
    prior: { returns: {}, residuals: {}, volatility: {}, returnPerVol: null, marketCap: null },
  }) as unknown as SecurityRecord

describe('sector leaders', () => {
  it('gives every sector in every index one slot when names exist', () => {
    const universe = SEGMENTS.flatMap((seg) =>
      GICS_SECTORS.flatMap((sector) => [
        make(`${seg.id}-${sector}-A`, seg.id, sector, 0.5, 0.4),
        make(`${seg.id}-${sector}-B`, seg.id, sector, 0.1, 0.05),
      ]),
    )
    const { slots, empty } = sectorLeaders(universe)
    expect(slots).toHaveLength(33)
    expect(empty).toHaveLength(0)
    expect(new Set(slots.map((s) => `${s.segment}|${s.sector}`)).size).toBe(33)
    for (const slot of slots) expect(slot.security.ticker.endsWith('-A')).toBe(true)
  })

  it('ranks on the average of the two horizons, not either one alone', () => {
    // B loses 12−1 but wins 6−1 by more, so its average rank is better.
    const names = [
      make('A', '500', 'Energy', 0.9, 0.1),
      make('B', '500', 'Energy', 0.8, 0.9),
      make('C', '500', 'Energy', 0.7, 0.2),
    ]
    const [slot] = sectorLeaders(names).slots.filter((s) => s.sector === 'Energy')
    expect(slot?.security.ticker).toBe('B')
    expect(slot?.averageRank).toBe(1.5)
    expect(slot?.of).toBe(3)
  })

  it('reports a sector with no usable name as empty rather than filling it', () => {
    const names = [
      make('A', '500', 'Energy', 0.4, null),
      make('B', '500', 'Energy', null, 0.4),
    ]
    const { slots, empty } = sectorLeaders(names)
    expect(slots).toHaveLength(0)
    expect(empty.filter((e) => e.segment === '500' && e.sector === 'Energy')).toHaveLength(1)
    expect(empty).toHaveLength(33)
  })

  it('keeps a name inside its own segment and sector', () => {
    const names = [
      make('BIG', '500', 'Energy', 0.9, 0.9),
      make('MID', '400', 'Energy', 0.1, 0.1),
    ]
    const slots = sectorLeaders(names).slots
    expect(slots.find((s) => s.segment === '400')?.security.ticker).toBe('MID')
    expect(slots.find((s) => s.segment === '500')?.security.ticker).toBe('BIG')
  })
})

describe('cash division', () => {
  it('adds to the total exactly', () => {
    const weights = Array.from({ length: 33 }, (_, i) => 1 / (i + 2))
    const amounts = cashAmounts(weights, 30_000)
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(30_000)
    expect(amounts.every((a) => Number.isInteger(a))).toBe(true)
  })

  it('gives more cash to the larger weight', () => {
    const [small, large] = cashAmounts([1, 3], 1000)
    expect(small).toBe(250)
    expect(large).toBe(750)
  })

  it('hands leftover dollars to the largest remainders', () => {
    // Three equal weights over $100: 33.33 each, one dollar left to place.
    const amounts = cashAmounts([1, 1, 1], 100)
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(100)
    expect(amounts.filter((a) => a === 34)).toHaveLength(1)
  })

  it('refuses to invent money from nothing', () => {
    expect(cashAmounts([], 30_000)).toEqual([])
    expect(cashAmounts([0, 0], 30_000)).toEqual([0, 0])
    expect(cashAmounts([1, 1], 0)).toEqual([0, 0])
  })
})
