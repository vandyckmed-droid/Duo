import { describe, expect, it } from 'vitest'
import {
  applyEligibility,
  companyKey,
  normaliseTicker,
  parseConstituentsTable,
  type Member,
} from './membership.ts'
import { fetchFrom, mergePoints } from './cache.ts'
import { Fmp, readApiKey } from './fmp.ts'
import { alignToCalendar, computeSecurity, computeUniverse } from './compute.ts'
import { hasErrors, validate } from './validate.ts'
import type { Manifest, SecurityRecord } from '../src/domain/dataset.ts'
import { benchmarkFor } from '../src/domain/segments.ts'
import type { PricePoint } from './fmp.ts'

describe('normaliseTicker', () => {
  it('converts index-list dots into the provider hyphen', () => {
    expect(normaliseTicker('BRK.B')).toBe('BRK-B')
    expect(normaliseTicker('bf.b')).toBe('BF-B')
    expect(normaliseTicker(' AAPL ')).toBe('AAPL')
  })
})

describe('parseConstituentsTable', () => {
  const html = `
    <h2 id="constituents">Constituents</h2>
    <table>
      <tr><th>Symbol</th><th>Security</th><th>GICS Sector</th><th>GICS Sub-Industry</th></tr>
      <tr><td><a href="/x">AA</a></td><td><a>Alcoa</a></td><td>Materials</td><td>Aluminum</td></tr>
      <tr><td>BRK.B</td><td>Berkshire Hathaway&nbsp;Inc.</td><td>Financials</td><td>Multi-Sector</td></tr>
      <tr><td>Not a ticker</td><td>x</td><td>y</td><td>z</td></tr>
    </table>`

  it('reads ticker, name, sector and industry', () => {
    const rows = parseConstituentsTable(html, '400')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      ticker: 'AA',
      name: 'Alcoa',
      segment: '400',
      sector: 'Materials',
      industry: 'Aluminum',
    })
  })

  it('normalises tickers and decodes entities', () => {
    const rows = parseConstituentsTable(html, '400')
    expect(rows[1]?.ticker).toBe('BRK-B')
    expect(rows[1]?.name).toBe('Berkshire Hathaway Inc.')
  })

  it('rejects rows that are not constituents', () => {
    expect(parseConstituentsTable(html, '400').map((r) => r.ticker)).not.toContain('Not a ticker')
  })

  it('throws rather than returning nothing when the table is gone', () => {
    expect(() => parseConstituentsTable('<p>no table</p>', '600')).toThrow(/not found/)
  })
})

describe('applyEligibility', () => {
  const member = (ticker: string, name: string, segment: Member['segment']): Member => ({
    ticker,
    name,
    segment,
    sector: 'Financials',
    industry: 'Banks',
  })

  it('keeps the larger segment when a ticker appears in two', () => {
    // Membership churn: a name promoted out of the 600 can linger in a stale
    // list. Keeping both would rank it twice, against two different benchmarks.
    const { eligible, excluded } = applyEligibility(
      [member('XYZ', 'Xyz Inc.', '600'), member('XYZ', 'Xyz Inc.', '500')],
      () => 1e9,
    )
    expect(eligible).toHaveLength(1)
    expect(eligible[0]?.segment).toBe('500')
    expect(excluded[0]?.reason).toContain('600')
  })

  it('keeps the larger listing of a duplicate share class', () => {
    const caps = new Map([
      ['GOOG', 1e11],
      ['GOOGL', 2e11],
    ])
    const { eligible, excluded } = applyEligibility(
      [member('GOOG', 'Alphabet Inc. Class C', '500'), member('GOOGL', 'Alphabet Inc. Class A', '500')],
      (t) => caps.get(t) ?? null,
    )
    expect(eligible.map((m) => m.ticker)).toEqual(['GOOGL'])
    expect(excluded[0]?.ticker).toBe('GOOG')
    expect(excluded[0]?.reason).toContain('duplicate share class')
  })

  it('leaves genuinely different companies alone', () => {
    const { eligible } = applyEligibility(
      [member('AAA', 'Alpha Industries', '500'), member('BBB', 'Beta Industries', '500')],
      () => 1e9,
    )
    expect(eligible).toHaveLength(2)
  })

  it('is deterministic when neither duplicate has a market cap', () => {
    const a = applyEligibility(
      [member('ZZZ', 'Same Co Class B', '500'), member('AAA', 'Same Co Class A', '500')],
      () => null,
    )
    expect(a.eligible.map((m) => m.ticker)).toEqual(['AAA'])
  })

  it('collapses share-class suffixes onto one company', () => {
    expect(companyKey('Alphabet Inc. Class A')).toBe(companyKey('Alphabet Inc. Class C'))
    expect(companyKey('Fox Corporation')).not.toBe(companyKey('Fortive Corporation'))
  })
})

describe('cache merging', () => {
  const p = (date: string, close: number): PricePoint => ({ date, close })

  it('adds new observations and keeps the old ones', () => {
    const merged = mergePoints([p('2026-01-02', 10)], [p('2026-01-03', 11)], '2020-01-01')
    expect(merged).toEqual([p('2026-01-02', 10), p('2026-01-03', 11)])
  })

  it('lets a restated close correct the cached one', () => {
    const merged = mergePoints([p('2026-01-02', 10)], [p('2026-01-02', 9.87)], '2020-01-01')
    expect(merged).toEqual([p('2026-01-02', 9.87)])
  })

  it('never loses history when the provider returns nothing', () => {
    // A failed or empty response must not shorten a good series.
    const cached = [p('2026-01-02', 10), p('2026-01-03', 11)]
    expect(mergePoints(cached, [], '2020-01-01')).toEqual(cached)
  })

  it('drops observations before the retention floor', () => {
    const merged = mergePoints([p('2019-01-02', 5), p('2026-01-02', 10)], [], '2020-01-01')
    expect(merged).toEqual([p('2026-01-02', 10)])
  })

  it('discards non-positive closes on the way in', () => {
    const merged = mergePoints([], [p('2026-01-02', 0), p('2026-01-03', -1), p('2026-01-04', 3)], '2020-01-01')
    expect(merged).toEqual([p('2026-01-04', 3)])
  })

  it('returns sorted, deduplicated dates', () => {
    const merged = mergePoints([p('2026-01-03', 11)], [p('2026-01-02', 10), p('2026-01-03', 12)], '2020-01-01')
    expect(merged.map((x) => x.date)).toEqual(['2026-01-02', '2026-01-03'])
    expect(merged[1]?.close).toBe(12)
  })
})

describe('fetchFrom', () => {
  it('asks for the whole window when the cache is cold', () => {
    expect(fetchFrom([], '2023-08-19')).toBe('2023-08-19')
  })

  it('re-requests a short overlap so restatements are picked up', () => {
    // Starting the day after the last close would freeze an adjustment that
    // the provider applies retroactively to already-published days.
    expect(fetchFrom([{ date: '2026-08-18', close: 10 }], '2023-08-19', 7)).toBe('2026-08-11')
  })

  it('never asks for more than the retention window', () => {
    expect(fetchFrom([{ date: '2023-08-20', close: 10 }], '2023-08-19', 30)).toBe('2023-08-19')
  })
})

describe('alignToCalendar', () => {
  it('builds the calendar from the benchmarks, not from the constituents', () => {
    const benchmarks = new Map([
      ['SPY', [{ date: '2026-01-02', close: 500 }, { date: '2026-01-05', close: 505 }]],
    ])
    // A constituent carrying a bogus weekend date must not shift every offset.
    const securities = new Map([
      ['AAA', [{ date: '2026-01-02', close: 10 }, { date: '2026-01-03', close: 11 }]],
    ])
    const aligned = alignToCalendar(benchmarks, securities)
    expect(aligned.calendar).toEqual(['2026-01-02', '2026-01-05'])
    expect(aligned.closes.get('AAA')).toEqual([10, null])
    expect(aligned.orphanedObservations).toBe(1)
  })

  it('leaves a non-trading day as a hole rather than filling it', () => {
    const benchmarks = new Map([
      [
        'SPY',
        [
          { date: '2026-01-02', close: 500 },
          { date: '2026-01-05', close: 505 },
          { date: '2026-01-06', close: 507 },
        ],
      ],
    ])
    const securities = new Map([
      ['AAA', [{ date: '2026-01-02', close: 10 }, { date: '2026-01-06', close: 12 }]],
    ])
    expect(alignToCalendar(benchmarks, securities).closes.get('AAA')).toEqual([10, null, 12])
  })
})

/** Deterministic price path shared by the compute tests. */
function path(days: number, dailyRate: number, start = 100): PricePoint[] {
  const out: PricePoint[] = []
  let value = start
  const d = new Date(Date.UTC(2022, 0, 3))
  for (let i = 0; i < days; i++) {
    // Weekdays only, which is close enough to a trading calendar for a fixture.
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
    out.push({ date: d.toISOString().slice(0, 10), close: Number(value.toFixed(4)) })
    value *= 1 + dailyRate
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

describe('computeSecurity', () => {
  const benchmarkPoints = path(900, 0.0004)
  const stockPoints = path(900, 0.0009)
  const benchmarks = new Map([
    ['SPY', benchmarkPoints],
    ['IJH', benchmarkPoints],
    ['IJR', benchmarkPoints],
  ])
  const aligned = alignToCalendar(benchmarks, new Map([['AAA', stockPoints]]))
  const context = {
    calendar: aligned.calendar,
    benchmarks: new Map(
      ['SPY', 'IJH', 'IJR'].map((t) => [t, aligned.closes.get(t) ?? []] as const),
    ),
  }
  const member = {
    ticker: 'AAA',
    name: 'Alpha Inc.',
    sector: 'Technology',
    industry: 'Software',
  }

  it('stamps every security with its own segment benchmark', () => {
    for (const segment of ['500', '400', '600'] as const) {
      const record = computeSecurity(
        {
          member: { ...member, segment },
          closes: aligned.closes.get('AAA') ?? [],
          marketCap: 1e9,
          priorMarketCap: 9e8,
          stale: false,
        },
        context,
      ) as SecurityRecord
      expect(record.benchmark).toBe(benchmarkFor(segment))
    }
  })

  it('never regresses a 400 or 600 name against SPY', () => {
    for (const segment of ['400', '600'] as const) {
      const record = computeSecurity(
        {
          member: { ...member, segment },
          closes: aligned.closes.get('AAA') ?? [],
          marketCap: null,
          priorMarketCap: null,
          stale: false,
        },
        context,
      ) as SecurityRecord
      expect(record.benchmark).not.toBe('SPY')
    }
  })

  it('fails loudly if a segment benchmark is absent from the dataset', () => {
    expect(() =>
      computeSecurity(
        {
          member: { ...member, segment: '600' },
          closes: aligned.closes.get('AAA') ?? [],
          marketCap: null,
          priorMarketCap: null,
          stale: false,
        },
        { calendar: aligned.calendar, benchmarks: new Map([['SPY', aligned.closes.get('SPY') ?? []]]) },
      ),
    ).toThrow(/IJR/)
  })

  it('publishes the full metric family with prior values for rank change', () => {
    const record = computeSecurity(
      {
        member: { ...member, segment: '500' },
        closes: aligned.closes.get('AAA') ?? [],
        marketCap: 1e9,
        priorMarketCap: 9e8,
        stale: false,
      },
      context,
    ) as SecurityRecord

    expect(record.returns['12-1']).toBeGreaterThan(0)
    expect(record.returns['6-1']).toBeGreaterThan(0)
    expect(record.returns['3M']).toBeGreaterThan(0)
    expect(record.volatility['1Y']).toBeGreaterThanOrEqual(0)
    expect(record.beta).toBeGreaterThan(0)
    expect(record.betaObservations).toBeGreaterThan(500)
    // Outrunning the benchmark every day leaves a positive residual.
    expect(record.residuals['12M']).toBeGreaterThan(0)
    expect(record.prior.returns['12-1']).not.toBeNull()
    expect(record.history.days).toBe(900)
    expect(record.low52).toBeLessThan(record.high52 as number)
  })

  it('leaves metrics blank rather than inventing them for a short history', () => {
    const short = alignToCalendar(benchmarks, new Map([['NEW', path(60, 0.001)]]))
    const record = computeSecurity(
      {
        member: { ...member, ticker: 'NEW', segment: '500' },
        closes: short.closes.get('NEW') ?? [],
        marketCap: null,
        priorMarketCap: null,
        stale: false,
      },
      { calendar: short.calendar, benchmarks: context.benchmarks },
    ) as SecurityRecord
    expect(record.returns['12-1']).toBeNull()
    expect(record.beta).toBeNull()
    expect(record.residuals['12M']).toBeNull()
  })

  it('drops a name with no usable history and says why', () => {
    const { securities, excluded } = computeUniverse(
      [
        {
          member: { ...member, ticker: 'DEAD', segment: '500' },
          closes: Array.from({ length: aligned.calendar.length }, () => null),
          marketCap: null,
          priorMarketCap: null,
          stale: true,
        },
      ],
      context,
    )
    expect(securities).toHaveLength(0)
    expect(excluded[0]).toEqual({ ticker: 'DEAD', reason: 'no usable price history' })
  })
})

describe('validate', () => {
  const base: SecurityRecord = {
    ticker: 'AAA',
    name: 'Alpha',
    segment: '400',
    benchmark: 'IJH',
    sector: 'Technology',
    industry: 'Software',
    marketCap: 1e9,
    returns: { '12-1': 0.2 },
    residuals: { '12M': 0.1 },
    volatility: { '1Y': 0.3 },
    returnPerVol: 0.6,
    maxDrawdown: -0.2,
    beta: 1.1,
    betaR2: 0.4,
    betaObservations: 700,
    last: 10,
    lastDate: '2026-08-18',
    low52: 8,
    high52: 12,
    history: { days: 700, from: '2023-08-18', to: '2026-08-18' },
    prior: { returns: { '12-1': 0.1 }, residuals: {}, volatility: {}, returnPerVol: 0.4, marketCap: 9e8 },
  }
  const universe = [
    base,
    { ...base, ticker: 'BBB', segment: '500' as const, benchmark: 'SPY' },
    { ...base, ticker: 'CCC', segment: '600' as const, benchmark: 'IJR' },
  ]
  const manifest: Manifest = {
    version: 3,
    generatedAt: '2026-08-19T00:00:00.000Z',
    asOf: '2026-08-18',
    provider: 'financialmodelingprep.com/stable',
    benchmarks: { '500': 'SPY', '400': 'IJH', '600': 'IJR' },
    membership: [
      { segment: '500', source: 'fmp:sp500-constituent', detail: '', count: 1 },
      { segment: '400', source: 'wikipedia:sp400', detail: '', count: 1 },
      { segment: '600', source: 'wikipedia:sp600', detail: '', count: 1 },
    ],
    counts: { total: 3 },
    calendarDays: 756,
    windows: {},
    betaLookback: 756,
    rankChangeOffset: 63,
    excluded: [],
  }
  const options = { minimumSecurities: 3, minimumCoverage: 0.5 }

  it('passes a well-formed dataset', () => {
    expect(hasErrors(validate(universe, manifest, options))).toBe(false)
  })

  it('rejects a 400 name carrying the large-cap benchmark', () => {
    const wrong = [{ ...base, benchmark: 'SPY' }, ...universe.slice(1)]
    const issues = validate(wrong, manifest, options)
    expect(hasErrors(issues)).toBe(true)
    expect(issues.some((i) => i.message.includes('must use IJH'))).toBe(true)
  })

  it('rejects a duplicated ticker', () => {
    expect(hasErrors(validate([...universe, base], manifest, options))).toBe(true)
  })

  it('rejects a dataset that lost a whole segment', () => {
    const issues = validate(universe.slice(0, 2), manifest, options)
    expect(issues.some((i) => i.message.includes('segment 600 has no securities'))).toBe(true)
  })

  it('rejects a suspiciously small dataset', () => {
    expect(hasErrors(validate(universe, manifest, { minimumSecurities: 900 }))).toBe(true)
  })

  it('rejects thin coverage of the headline metric', () => {
    const blank = universe.map((s) => ({ ...s, returns: {} }))
    expect(hasErrors(validate(blank, manifest, { ...options, minimumCoverage: 0.75 }))).toBe(true)
  })

  it('rejects a manifest whose benchmark map disagrees with the domain', () => {
    const tampered = { ...manifest, benchmarks: { ...manifest.benchmarks, '400': 'SPY' } }
    expect(hasErrors(validate(universe, tampered, options))).toBe(true)
  })

  it('rejects a manifest missing a membership source', () => {
    const partial = { ...manifest, membership: manifest.membership.slice(0, 2) }
    expect(hasErrors(validate(universe, partial, options))).toBe(true)
  })

  it('rejects non-finite and negative numbers', () => {
    const bad = [{ ...base, returns: { '12-1': Number.POSITIVE_INFINITY } }, ...universe.slice(1)]
    expect(hasErrors(validate(bad, manifest, options))).toBe(true)
    const negativeVol = [{ ...base, volatility: { '1Y': -0.1 } }, ...universe.slice(1)]
    expect(hasErrors(validate(negativeVol, manifest, options))).toBe(true)
  })

  it('warns without failing when many names are stale', () => {
    const stale = universe.map((s) => ({ ...s, stale: true }))
    const issues = validate(stale, manifest, options)
    expect(hasErrors(issues)).toBe(false)
    expect(issues.some((i) => i.level === 'warning')).toBe(true)
  })
})

describe('readApiKey', () => {
  it('prefers the provider-specific name', () => {
    expect(readApiKey({ FMP_API_KEY: 'a', API_KEY: 'b' })).toBe('a')
  })

  it('falls back to the name the credential is already configured under', () => {
    // Renaming a working secret to satisfy a preference is a worse trade than
    // reading the second name.
    expect(readApiKey({ API_KEY: 'b' })).toBe('b')
  })

  it('treats blank and whitespace-only values as absent', () => {
    // An unset repository secret interpolates to an empty string rather than
    // vanishing, so the variable exists and is useless.
    expect(readApiKey({ FMP_API_KEY: '', API_KEY: 'b' })).toBe('b')
    expect(readApiKey({ FMP_API_KEY: '   ', API_KEY: 'b' })).toBe('b')
    expect(readApiKey({})).toBe('')
    expect(readApiKey({ FMP_API_KEY: undefined })).toBe('')
  })

  it('trims a stray newline from the value', () => {
    expect(readApiKey({ FMP_API_KEY: 'a\n' })).toBe('a')
  })

  it('refuses to construct a client without a key, naming both variables', () => {
    expect(() => new Fmp(readApiKey({}))).toThrow(/FMP_API_KEY or API_KEY/)
  })
})
