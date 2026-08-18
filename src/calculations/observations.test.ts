import { describe, expect, it } from 'vitest'
import type { PricePoint } from '../data/types.ts'
import { toObservations } from './observations.ts'

function point(date: string, adjustedClose: number): PricePoint {
  return { date, adjustedClose }
}

function dates(points: readonly { timestamp: number }[]): readonly string[] {
  return points.map((p) => new Date(p.timestamp).toISOString().slice(0, 10))
}

describe('toObservations', () => {
  it('orders oldest to newest regardless of input order', () => {
    const result = toObservations([
      point('2024-03-01', 30),
      point('2024-01-01', 10),
      point('2024-02-01', 20),
    ])

    expect(dates(result)).toEqual(['2024-01-01', '2024-02-01', '2024-03-01'])
    expect(result.map((o) => o.adjustedClose)).toEqual([10, 20, 30])
  })

  it('drops points with an unusable price or an unusable date', () => {
    const result = toObservations([
      point('2024-01-01', 10),
      point('2024-01-02', 0),
      point('2024-01-03', NaN),
      point('not-a-date', 40),
      point('2024-01-05', 50),
    ])

    expect(dates(result)).toEqual(['2024-01-01', '2024-01-05'])
  })

  it('collapses duplicate dates to the last point given for that date', () => {
    const result = toObservations([
      point('2024-01-01', 10),
      point('2024-01-01', 11),
      point('2024-01-02', 20),
    ])

    expect(result).toHaveLength(2)
    expect(result[0].adjustedClose).toBe(11)
  })

  it('treats a bare date and a full datetime as the same session', () => {
    const result = toObservations([
      point('2024-01-01', 10),
      point('2024-01-01T00:00:00Z', 12),
    ])

    expect(result).toHaveLength(1)
    expect(result[0].adjustedClose).toBe(12)
  })

  it('returns an empty list when nothing is usable', () => {
    expect(toObservations([])).toEqual([])
    expect(toObservations([point('bad', 1), point('2024-01-01', -1)])).toEqual(
      [],
    )
  })
})
