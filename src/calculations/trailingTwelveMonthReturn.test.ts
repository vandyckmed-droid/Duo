import { describe, expect, it } from 'vitest'
import type { PricePoint } from '../data/types.ts'
import { calculateTrailingTwelveMonthReturn } from './trailingTwelveMonthReturn.ts'

function point(date: string, adjustedClose: number): PricePoint {
  return { date, adjustedClose }
}

describe('calculateTrailingTwelveMonthReturn', () => {
  it('returns a positive fraction across an exact 12-month anniversary', () => {
    const points = [point('2024-01-15', 100), point('2025-01-15', 150)]
    expect(calculateTrailingTwelveMonthReturn(points)).toBeCloseTo(0.5)
  })

  it('returns a negative fraction across an exact 12-month anniversary', () => {
    const points = [point('2024-01-15', 100), point('2025-01-15', 75)]
    expect(calculateTrailingTwelveMonthReturn(points)).toBeCloseTo(-0.25)
  })

  it('returns zero when the anniversary price is unchanged', () => {
    const points = [point('2024-01-15', 100), point('2025-01-15', 100)]
    expect(calculateTrailingTwelveMonthReturn(points)).toBe(0)
  })

  it('uses the latest valid point on or before a missing anniversary date', () => {
    const points = [
      point('2024-01-10', 100), // nearest valid point before the anniversary
      point('2024-02-01', 110), // after the anniversary — must not be used
      point('2025-01-15', 150), // anniversary would be 2024-01-15, which has no point
    ]
    expect(calculateTrailingTwelveMonthReturn(points)).toBeCloseTo(0.5)
  })

  it('ignores an invalid point that falls exactly on the anniversary', () => {
    const points = [
      point('2024-01-10', 100),
      point('2024-01-15', NaN), // sits on the anniversary but is unusable
      point('2025-01-15', 150),
    ]
    expect(calculateTrailingTwelveMonthReturn(points)).toBeCloseTo(0.5)
  })

  it('falls back to the latest valid point when the newest point is invalid', () => {
    const points = [
      point('2024-01-10', 100),
      point('2025-01-14', 140),
      point('2025-01-15', -1), // newest by date, but unusable
    ]
    expect(calculateTrailingTwelveMonthReturn(points)).toBeCloseTo(0.4)
  })

  it('does not let history older than 12 months widen the horizon', () => {
    const points = [
      point('2020-01-15', 10), // far older — must be ignored
      point('2023-01-15', 50), // older than 12 months — must be ignored
      point('2024-01-15', 100), // the true anniversary point
      point('2025-01-15', 150),
    ]
    expect(calculateTrailingTwelveMonthReturn(points)).toBeCloseTo(0.5)
  })

  it('clamps a 29 February endpoint to 28 February of the prior year, not 1 March', () => {
    const points = [
      point('2023-02-28', 100), // the correct 12-month starting observation
      point('2023-03-01', 110), // must NOT be used — that would mean the
      //                           anniversary rolled forward past Feb 28
      point('2024-02-29', 150), // 2024 is a leap year
    ]
    expect(calculateTrailingTwelveMonthReturn(points)).toBeCloseTo(0.5)
  })

  it('returns null when there is no valid point at all', () => {
    const points = [point('2024-01-15', NaN), point('2025-01-15', -1)]
    expect(calculateTrailingTwelveMonthReturn(points)).toBeNull()
  })

  it('returns null when less than 12 months of history is available', () => {
    const points = [point('2024-06-01', 100), point('2025-01-15', 150)]
    expect(calculateTrailingTwelveMonthReturn(points)).toBeNull()
  })

  it('returns null for an empty window', () => {
    expect(calculateTrailingTwelveMonthReturn([])).toBeNull()
  })
})
