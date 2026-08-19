import { describe, expect, it } from 'vitest'
import { DEFAULT_SCREEN, filter, screen, sectorsOf } from './screen.ts'
import type { SecurityRecord } from './dataset.ts'
import type { Segment } from './segments.ts'

function make(
  ticker: string,
  segment: Segment,
  sector: string,
  m12: number | null,
  prior12: number | null = m12,
  extra: Partial<SecurityRecord> = {},
): SecurityRecord {
  return {
    ticker,
    name: `${ticker} Inc.`,
    segment,
    benchmark: segment === '500' ? 'SPY' : segment === '400' ? 'IJH' : 'IJR',
    sector,
    industry: 'Widgets',
    marketCap: 1e9,
    returns: { '12-1': m12, '12M': m12 },
    residuals: { '12M': m12 },
    volatility: { '1Y': 0.3, '3M': 0.28 },
    returnPerVol: m12 === null ? null : m12 / 0.3,
    maxDrawdown: -0.2,
    beta: 1,
    betaR2: 0.5,
    betaObservations: 700,
    last: 100,
    lastDate: '2026-08-18',
    low52: 80,
    high52: 120,
    history: { days: 750, from: '2023-08-18', to: '2026-08-18' },
    prior: {
      returns: { '12-1': prior12, '12M': prior12 },
      residuals: { '12M': prior12 },
      volatility: { '1Y': 0.3, '3M': 0.28 },
      returnPerVol: prior12 === null ? null : prior12 / 0.3,
      marketCap: 9e8,
    },
    ...extra,
  }
}

const universe: SecurityRecord[] = [
  make('AAA', '500', 'Technology', 0.5, 0.1),
  make('BBB', '400', 'Energy', 0.2, 0.6),
  make('CCC', '600', 'Technology', 0.9, 0.9),
  make('DDD', '600', 'Energy', null, null),
]

const noWatchlist = new Set<string>()

describe('filter', () => {
  it('composes segment, sector and watchlist', () => {
    expect(filter(universe, { ...DEFAULT_SCREEN, segment: '600' }, noWatchlist)).toHaveLength(2)
    expect(filter(universe, { ...DEFAULT_SCREEN, sector: 'Energy' }, noWatchlist)).toHaveLength(2)
    expect(
      filter(universe, { ...DEFAULT_SCREEN, segment: '600', sector: 'Energy' }, noWatchlist),
    ).toHaveLength(1)
  })

  it('restricts to the watchlist without changing anything else', () => {
    const watchlist = new Set(['AAA', 'CCC'])
    const rows = filter(universe, { ...DEFAULT_SCREEN, watchlistOnly: true }, watchlist)
    expect(rows.map((r) => r.ticker)).toEqual(['AAA', 'CCC'])
  })

  it('searches ticker and name, case-insensitively', () => {
    expect(filter(universe, { ...DEFAULT_SCREEN, query: 'ccc' }, noWatchlist)).toHaveLength(1)
    expect(filter(universe, { ...DEFAULT_SCREEN, query: 'inc' }, noWatchlist)).toHaveLength(4)
  })

  it('all segments means all segments', () => {
    expect(filter(universe, DEFAULT_SCREEN, noWatchlist)).toHaveLength(4)
  })
})

describe('screen', () => {
  it('ranks by the active metric, best first', () => {
    const r = screen(universe, { ...DEFAULT_SCREEN, metricId: '12-1' }, noWatchlist)
    expect(r.rows.map((row) => row.security.ticker)).toEqual(['CCC', 'AAA', 'BBB'])
    expect(r.rows[0]?.rank).toBe(1)
  })

  it('sets the unmeasured name aside instead of ranking it worst', () => {
    const r = screen(universe, { ...DEFAULT_SCREEN, metricId: '12-1' }, noWatchlist)
    expect(r.unranked.map((row) => row.security.ticker)).toEqual(['DDD'])
    expect(r.total).toBe(4)
  })

  it('reranks instantly on a different metric without touching the filters', () => {
    const view = { ...DEFAULT_SCREEN, segment: '600' as const, metricId: 'volatility' }
    const r = screen(universe, view, noWatchlist)
    // Volatility ranks ascending; both 600 names share 0.3 so ticker breaks the tie.
    expect(r.rows.map((row) => row.security.ticker)).toEqual(['CCC', 'DDD'])
    expect(r.rows.every((row) => row.security.segment === '600')).toBe(true)
  })

  it('inverts a metric direction on request', () => {
    const asc = screen(universe, { ...DEFAULT_SCREEN, metricId: '12-1', invert: true }, noWatchlist)
    expect(asc.rows.map((row) => row.security.ticker)).toEqual(['BBB', 'AAA', 'CCC'])
  })

  it('reports rank change as positions climbed within the list on screen', () => {
    // By 12−1 now: CCC 1, AAA 2, BBB 3. By prior 12−1: CCC 1, BBB 2, AAA 3.
    const r = screen(universe, { ...DEFAULT_SCREEN, metricId: '12-1' }, noWatchlist)
    const change = new Map(r.rows.map((row) => [row.security.ticker, row.change]))
    expect(change.get('AAA')).toBe(1)
    expect(change.get('BBB')).toBe(-1)
    expect(change.get('CCC')).toBe(0)
  })

  it('ranks by rank change when that is the active metric', () => {
    const r = screen(universe, { ...DEFAULT_SCREEN, metricId: 'rank-change' }, noWatchlist)
    expect(r.rows[0]?.security.ticker).toBe('AAA')
    expect(r.rows[0]?.value).toBe(1)
    expect(r.rows.at(-1)?.security.ticker).toBe('BBB')
  })

  it('measures rank change within the filtered list, not the whole universe', () => {
    const all = screen(universe, { ...DEFAULT_SCREEN, metricId: '12-1' }, noWatchlist)
    const tech = screen(
      universe,
      { ...DEFAULT_SCREEN, metricId: '12-1', sector: 'Technology' },
      noWatchlist,
    )
    // AAA climbs past BBB in the full list, but BBB is not in the tech list.
    expect(all.rows.find((r) => r.security.ticker === 'AAA')?.change).toBe(1)
    expect(tech.rows.find((r) => r.security.ticker === 'AAA')?.change).toBe(0)
  })

  it('ranks the watchlist with the same engine as the full universe', () => {
    const watchlist = new Set(['AAA', 'CCC'])
    const scoped = screen(
      universe,
      { ...DEFAULT_SCREEN, metricId: '12-1', watchlistOnly: true },
      watchlist,
    )
    const full = screen(universe, { ...DEFAULT_SCREEN, metricId: '12-1' }, noWatchlist)
    expect(scoped.rows.map((r) => r.security.ticker)).toEqual(['CCC', 'AAA'])
    // Same order the two names appear in within the full ranking.
    expect(
      full.rows.filter((r) => watchlist.has(r.security.ticker)).map((r) => r.security.ticker),
    ).toEqual(['CCC', 'AAA'])
  })

  it('returns an empty result rather than throwing on an empty filter', () => {
    const r = screen(universe, { ...DEFAULT_SCREEN, sector: 'Utilities' }, noWatchlist)
    expect(r.rows).toHaveLength(0)
    expect(r.total).toBe(0)
  })

  it('falls back to the default metric for an unknown id', () => {
    const r = screen(universe, { ...DEFAULT_SCREEN, metricId: 'bogus' }, noWatchlist)
    expect(r.rows).toHaveLength(3)
  })
})

describe('sectorsOf', () => {
  it('lists the sectors present, sorted and deduplicated', () => {
    expect(sectorsOf(universe)).toEqual(['Energy', 'Technology'])
  })
})
