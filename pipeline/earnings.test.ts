import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mergeCalendar, refreshEarningsStore, readStore, RETENTION_DAYS } from './earnings.ts'
import type { EarningsEvent } from './fmp.ts'

const event = (over: Partial<EarningsEvent> = {}): EarningsEvent => ({
  date: '2026-08-01',
  epsActual: 1.5,
  epsEstimated: 1.2,
  revenueActual: null,
  revenueEstimated: null,
  ...over,
})

describe('mergeCalendar', () => {
  it('appends new dates but never rewrites a captured announcement', () => {
    const merged = mergeCalendar(
      { AAPL: [event({ epsEstimated: 1.2 })] },
      [
        // A restated estimate for the captured date must not win…
        { symbol: 'AAPL', ...event({ epsEstimated: 1.4 }) },
        // …while a new date appends.
        { symbol: 'AAPL', ...event({ date: '2026-08-15', epsActual: 2 }) },
      ],
      '2026-01-01',
    )
    expect(merged['AAPL']).toHaveLength(2)
    expect(merged['AAPL']?.[0]?.epsEstimated).toBe(1.2)
    expect(merged['AAPL']?.[1]?.date).toBe('2026-08-15')
  })

  it('drops announcements older than the retention line, cached or fetched', () => {
    const merged = mergeCalendar(
      { OLD: [event({ date: '2025-01-01' })] },
      [{ symbol: 'ALSO', ...event({ date: '2025-02-01' }) }],
      '2026-01-01',
    )
    expect(merged['OLD']).toBeUndefined()
    expect(merged['ALSO']).toBeUndefined()
  })

  it('keeps events sorted oldest first per symbol', () => {
    const merged = mergeCalendar({}, [
      { symbol: 'A', ...event({ date: '2026-08-10' }) },
      { symbol: 'A', ...event({ date: '2026-05-10' }) },
    ], '2026-01-01')
    expect(merged['A']?.map((e) => e.date)).toEqual(['2026-05-10', '2026-08-10'])
  })
})

describe('refreshEarningsStore', () => {
  it('cold-starts over the retention window in bounded chunks and persists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'earn-store-'))
    const path = join(dir, 'calendar.json')
    const ranges: [string, string][] = []
    const fmp = {
      earningsCalendar: async (from: string, to: string) => {
        ranges.push([from, to])
        return [{ symbol: 'AAPL', ...event({ date: to }) }]
      },
    }
    const store = await refreshEarningsStore(path, fmp as never, '2026-08-18')
    expect(store.fetchedTo).toBe('2026-08-18')
    // Every chunk is at most 14 days and they tile the retention window.
    expect(ranges.length).toBeGreaterThan(RETENTION_DAYS / 14 - 1)
    for (const [from, to] of ranges) expect(to >= from).toBe(true)
    expect((await readStore(path))?.bySymbol['AAPL']?.length).toBeGreaterThan(0)
  })

  it('an incremental run refetches only the overlap', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'earn-store-'))
    const path = join(dir, 'calendar.json')
    const quiet = { earningsCalendar: async () => [] }
    await refreshEarningsStore(path, quiet as never, '2026-08-17')
    const ranges: [string, string][] = []
    const counting = {
      earningsCalendar: async (from: string, to: string) => {
        ranges.push([from, to])
        return []
      },
    }
    await refreshEarningsStore(path, counting as never, '2026-08-18')
    expect(ranges).toHaveLength(1)
    expect(ranges[0]?.[0]).toBe('2026-08-10') // fetchedTo − 7d overlap
  })

  it('a provider failure keeps the store exactly as it was', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'earn-store-'))
    const path = join(dir, 'calendar.json')
    const seeded = {
      earningsCalendar: async (_f: string, to: string) => [
        { symbol: 'KEEP', ...event({ date: to }) },
      ],
    }
    await refreshEarningsStore(path, seeded as never, '2026-08-17')
    const before = await readStore(path)
    const failing = {
      earningsCalendar: async () => {
        throw new Error('provider down')
      },
    }
    const result = await refreshEarningsStore(path, failing as never, '2026-08-18')
    expect(result).toEqual(before)
    expect(await readStore(path)).toEqual(before)
  })
})
