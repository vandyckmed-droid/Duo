import { describe, expect, it } from 'vitest'
import type { PriceSeries } from '../data/types.ts'
import { parseIsoDateToUtc } from './isoDate.ts'
import { calculateWindowedReturn, type MonthWindow } from './windowedReturn.ts'

const TWELVE_ONE: MonthWindow = { fromMonthsAgo: 12, toMonthsAgo: 1 }
const TWELVE_ZERO: MonthWindow = { fromMonthsAgo: 12, toMonthsAgo: 0 }

/** Builds a series from `date -> close` pairs, in any order. */
function series(entries: readonly (readonly [string, number | null])[]) {
  const sorted = [...entries].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  return {
    timestamps: sorted.map(([date]) => parseIsoDateToUtc(date) as number),
    closes: sorted.map(([, close]) => close),
  } satisfies PriceSeries
}

/** A daily-ish series spanning `2024-01-01`…`2025-01-01` at a flat price. */
function spanning(from: string, to: string, close: number) {
  const out: [string, number][] = []
  for (
    let t = parseIsoDateToUtc(from) as number;
    t <= (parseIsoDateToUtc(to) as number);
    t += 7 * 86_400_000
  ) {
    out.push([new Date(t).toISOString().slice(0, 10), close])
  }
  return out
}

describe('calculateWindowedReturn', () => {
  it('measures from twelve months back to one month back', () => {
    const s = series([
      ['2024-01-15', 100], // window start
      ['2024-06-15', 999], // inside the window — must not be an endpoint
      ['2024-12-15', 150], // window end (one month before the anchor)
      ['2025-01-15', 500], // the skipped month — must not be the endpoint
    ])
    expect(calculateWindowedReturn(s, TWELVE_ONE)).toBeCloseTo(0.5)
  })

  it('measures to the anchor itself when nothing is skipped', () => {
    const s = series([
      ['2024-01-15', 100],
      ['2024-12-15', 150],
      ['2025-01-15', 200],
    ])
    expect(calculateWindowedReturn(s, TWELVE_ZERO)).toBeCloseTo(1)
  })

  it('uses the nearest earlier close when a boundary has no print', () => {
    const s = series([
      ['2024-01-10', 100], // no print on the 15th; this stands in
      ['2024-02-01', 110],
      ['2024-12-15', 150],
      ['2025-01-15', 500],
    ])
    expect(calculateWindowedReturn(s, TWELVE_ONE)).toBeCloseTo(0.5)
  })

  it('steps over a gap at the boundary', () => {
    const s = series([
      ['2024-01-10', 100],
      ['2024-01-15', null], // halted on the boundary date
      ['2024-12-15', 150],
      ['2025-01-15', 500],
    ])
    expect(calculateWindowedReturn(s, TWELVE_ONE)).toBeCloseTo(0.5)
  })

  it('anchors to the latest usable close, not the latest date', () => {
    const s = series([
      ['2023-12-01', 100], // start measured from the 2024-12-15 anchor
      ['2024-01-10', 50], // start it would use if it anchored to 2025-01-15
      ['2024-12-15', 150],
      ['2025-01-15', null], // newest date, but unusable
    ])
    // Anchoring to the unusable date would shift the window and give 2.0.
    expect(calculateWindowedReturn(s, TWELVE_ZERO)).toBeCloseTo(0.5)
  })

  it('is unaffected by history older than the window', () => {
    const s = series([
      ['2020-01-15', 5], // far older — must be ignored
      ['2024-01-15', 100],
      ['2024-12-15', 150],
      ['2025-01-15', 500],
    ])
    expect(calculateWindowedReturn(s, TWELVE_ONE)).toBeCloseTo(0.5)
  })

  it.each([
    ['an empty series', series([])],
    ['a series with no usable close', series([['2025-01-15', null]])],
    [
      'less than twelve months of history',
      series([
        ['2024-08-01', 100],
        ['2025-01-15', 150],
      ]),
    ],
  ])('returns null for %s', (_label, s) => {
    expect(calculateWindowedReturn(s, TWELVE_ONE)).toBeNull()
  })

  it('returns null when the window collapses to a single point', () => {
    const s = series([['2025-01-15', 100]])
    expect(calculateWindowedReturn(s, TWELVE_ONE)).toBeNull()
  })

  it('handles a dense series spanning the full window', () => {
    const s = series(spanning('2023-06-01', '2025-01-01', 100))
    // Flat prices over the whole window: no move.
    expect(calculateWindowedReturn(s, TWELVE_ONE)).toBe(0)
  })
})
