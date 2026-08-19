import { describe, expect, it } from 'vitest'
import { SIGNAL_WINDOWS, momentumSignal } from '../src/calc/signals.ts'
import type { Manifest, SecurityRecord } from '../src/domain/dataset.ts'
import { fetchFrom, mergePoints } from './cache.ts'
import { HISTORY_TRADING_DAYS, alignToCalendar, computeUniverse } from './compute.ts'
import type { PricePoint } from './fmp.ts'
import {
  companyKey,
  type Member,
  normaliseTicker,
  parseConstituentsTable,
  resolveSegmentConflicts,
  resolveShareClasses,
} from './membership.ts'
import { hasErrors, validate } from './validate.ts'

/** `days` trading days (weekdays) of steady-growth prices ending 2026-08-18. */
function points(days: number, rate = 0.001, until = '2026-08-18'): PricePoint[] {
  const out: PricePoint[] = []
  const d = new Date(`${until}T00:00:00Z`)
  while (out.length < days) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
      out.push({ date: d.toISOString().slice(0, 10), close: 0 })
    }
    d.setUTCDate(d.getUTCDate() - 1)
  }
  out.reverse()
  return out.map((p, i) => ({ ...p, close: 100 * (1 + rate) ** i * (1 + (i % 2 ? 0.002 : -0.002)) }))
}

const member = (ticker: string, segment: Member['segment'] = '500', name = ticker): Member => ({
  ticker,
  name,
  segment,
  sector: 'Industrials',
})

describe('membership', () => {
  it('normalises class-share tickers to the provider convention', () => {
    expect(normaliseTicker('brk.b ')).toBe('BRK-B')
  })

  it('parses a constituents table and rejects junk rows', () => {
    const html = `
      <table id="constituents"><tbody>
        <tr><th>Symbol</th><th>Security</th><th>GICS Sector</th></tr>
        <tr><td><a href="/x">MMM</a></td><td>3M</td><td>Industrials</td></tr>
        <tr><td>BRK.B</td><td>Berkshire Hathaway</td><td>Financials</td></tr>
        <tr><td>not a ticker</td><td>Junk</td><td>Energy</td></tr>
      </tbody></table>`
    const rows = parseConstituentsTable(html, '500')
    expect(rows.map((r) => r.ticker)).toEqual(['MMM', 'BRK-B'])
    expect(rows[1]?.sector).toBe('Financials')
  })

  it('keeps the larger index when a ticker appears in two segments', () => {
    const { members, excluded } = resolveSegmentConflicts([member('AAA', '600'), member('AAA', '400')])
    expect(members).toHaveLength(1)
    expect(members[0]?.segment).toBe('400')
    expect(excluded[0]?.reason).toContain('kept the 400')
  })

  it('prefers the share class that is actually trading', () => {
    const evidence: Record<string, { staleness: number; observations: number; marketCap: number | null }> = {
      'CWEN-A': { staleness: 60, observations: 200, marketCap: 9e9 },
      CWEN: { staleness: 0, observations: 250, marketCap: 5e9 },
      GONE: { staleness: 90, observations: 40, marketCap: 1e9 },
    }
    const { eligible, excluded } = resolveShareClasses(
      [
        member('CWEN-A', '500', 'Clearway Energy Class A'),
        member('CWEN', '500', 'Clearway Energy Class C'),
        member('GONE', '600', 'Gone Corp'),
      ],
      (t) => evidence[t] as { staleness: number; observations: number; marketCap: number | null },
    )
    expect(eligible.map((m) => m.ticker)).toEqual(['CWEN'])
    expect(excluded.map((e) => e.ticker).sort()).toEqual(['CWEN-A', 'GONE'])
  })

  it('recognises one company across share-class naming noise', () => {
    expect(companyKey('Alphabet Inc. (Class A)')).toBe(companyKey('Alphabet Inc. (Class C)'))
    expect(companyKey('Coca-Cola Company')).not.toBe(companyKey('Coca-Cola Consolidated'))
  })
})

describe('price cache', () => {
  it('merges with later observations winning and trims old history', () => {
    const merged = mergePoints(
      [
        { date: '2026-01-02', close: 10 },
        { date: '2026-01-03', close: 11 },
      ],
      [
        { date: '2026-01-03', close: 11.5 },
        { date: '2026-01-06', close: 12 },
      ],
      '2026-01-03',
    )
    expect(merged).toEqual([
      { date: '2026-01-03', close: 11.5 },
      { date: '2026-01-06', close: 12 },
    ])
  })

  it('re-requests a short overlap rather than only the missing days', () => {
    expect(fetchFrom([{ date: '2026-08-10', close: 10 }], '2025-01-01')).toBe('2026-08-03')
    expect(fetchFrom([], '2025-01-01')).toBe('2025-01-01')
  })
})

describe('compute', () => {
  it('aligns securities onto the anchor calendar and computes full records', () => {
    const anchor = points(HISTORY_TRADING_DAYS + 10)
    const full = points(HISTORY_TRADING_DAYS + 10, 0.0015)
    const young = points(60)
    const aligned = alignToCalendar(anchor, new Map([
      ['FULL', full],
      ['YOUNG', young],
    ]))
    expect(aligned.calendar).toHaveLength(HISTORY_TRADING_DAYS)

    const result = computeUniverse([member('FULL'), member('YOUNG', '600')], aligned)
    expect(result.securities.map((s) => s.ticker)).toEqual(['FULL'])
    expect(result.excluded[0]).toMatchObject({ ticker: 'YOUNG' })
    expect(result.excluded[0]?.reason).toContain('12-1')

    const record = result.securities[0] as SecurityRecord
    expect(record.signals['12-1']).toBeTypeOf('number')
    expect(record.signals['6-1']).toBeTypeOf('number')
    expect(record.last).toBeGreaterThanOrEqual(record.low52)
    expect(record.last).toBeLessThanOrEqual(record.high52)
    expect(record.lastDate).toBe(aligned.calendar.at(-1))

    // The record's signal equals the calc layer's answer on the aligned series.
    const closes = aligned.closes.get('FULL') as (number | null)[]
    expect(record.signals['12-1']).toBeCloseTo(
      momentumSignal(closes, SIGNAL_WINDOWS['12-1'] as { formation: number; skip: number }) as number,
      12,
    )
  })

  it('drops observations on dates the anchor never traded', () => {
    const anchor: PricePoint[] = [
      { date: '2026-08-17', close: 100 },
      { date: '2026-08-18', close: 101 },
    ]
    const aligned = alignToCalendar(anchor, new Map([
      ['ODD', [{ date: '2026-08-16', close: 55 }, { date: '2026-08-18', close: 56 }]],
    ]))
    expect(aligned.closes.get('ODD')).toEqual([null, 56])
  })
})

function security(ticker: string, overrides: Partial<SecurityRecord> = {}): SecurityRecord {
  return {
    ticker,
    name: ticker,
    segment: '500',
    sector: 'Industrials',
    signals: { '12-1': 1.2, '6-1': 0.8 },
    last: 100,
    lastDate: '2026-08-18',
    low52: 80,
    high52: 120,
    ...overrides,
  }
}

function manifestFor(securities: readonly SecurityRecord[]): Manifest {
  return {
    version: 4,
    generatedAt: '2026-08-19T09:00:00Z',
    asOf: '2026-08-18',
    provider: 'test',
    counts: { total: securities.length },
    calendarDays: 288,
    windows: SIGNAL_WINDOWS,
    membership: [],
    excluded: [],
  }
}

describe('validate', () => {
  const options = { minimumSecurities: 2, today: '2026-08-19' }

  it('passes a healthy dataset', () => {
    const securities = [security('AAA'), security('BBB')]
    expect(hasErrors(validate(securities, manifestFor(securities), options))).toBe(false)
  })

  it('rejects short universes, broken signals, broken ranges and stale dates', () => {
    const short = validate([security('AAA')], manifestFor([security('AAA')]), options)
    expect(hasErrors(short)).toBe(true)

    const bad = [
      security('AAA', { signals: { '12-1': Number.NaN, '6-1': 1 } }),
      security('BBB', { last: 130 }),
      security('BBB'),
    ]
    const issues = validate(bad, manifestFor(bad), options)
    expect(issues.filter((i) => i.level === 'error').map((i) => i.message)).toEqual([
      'AAA: signal 12-1 is not a finite number',
      'BBB: last close 130 outside its 52-week range',
      'BBB: published twice',
    ])

    const extreme = [
      security('AAA', { signals: { '12-1': 29.8, '6-1': 2.2 } }),
      security('BBB', { signals: { '12-1': 120, '6-1': 1 } }),
    ]
    const extremeIssues = validate(extreme, manifestFor(extreme), options)
    // A genuine hyper-momentum year (SNDK 2026 scored 29.8) warns; only a
    // value beyond anything real prices produce blocks the publish.
    expect(extremeIssues.filter((i) => i.level === 'error').map((i) => i.message)).toEqual([
      'BBB: signal 12-1 = 120.0 is implausible',
    ])
    expect(extremeIssues.some((i) => i.level === 'warning' && i.message.startsWith('AAA'))).toBe(true)

    const stale = validate(
      [security('AAA'), security('BBB')],
      { ...manifestFor([security('AAA'), security('BBB')]), asOf: '2026-07-01' },
      options,
    )
    expect(hasErrors(stale)).toBe(true)
  })
})
