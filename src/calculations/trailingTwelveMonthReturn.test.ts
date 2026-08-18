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

  describe('date handling', () => {
    const ascending = [
      point('2024-01-15', 100),
      point('2024-06-01', 120),
      point('2025-01-15', 150),
    ]

    it('gives the same answer regardless of how the caller ordered points', () => {
      const descending = [...ascending].reverse()
      const unsorted = [ascending[1], ascending[2], ascending[0]]

      expect(calculateTrailingTwelveMonthReturn(ascending)).toBeCloseTo(0.5)
      expect(calculateTrailingTwelveMonthReturn(descending)).toBeCloseTo(0.5)
      expect(calculateTrailingTwelveMonthReturn(unsorted)).toBeCloseTo(0.5)
    })

    it('accepts full ISO datetimes, not just bare dates', () => {
      const points = [
        point('2024-01-15T00:00:00Z', 100),
        point('2025-01-15T00:00:00Z', 150),
      ]
      expect(calculateTrailingTwelveMonthReturn(points)).toBeCloseTo(0.5)
    })

    it.each([
      ['unparseable text', 'not-a-date'],
      ['an empty string', ''],
      ['an impossible calendar day', '2023-02-30'],
      ['an out-of-range month', '2023-13-01'],
    ])('skips a point dated with %s instead of throwing', (_label, date) => {
      const points = [
        point('2024-01-15', 100),
        point(date, 999), // unusable date — must be skipped, not crash
        point('2025-01-15', 150),
      ]
      expect(calculateTrailingTwelveMonthReturn(points)).toBeCloseTo(0.5)
    })

    it('returns null rather than throwing when the newest date is unusable', () => {
      const points = [point('2024-01-15', 100), point('garbage', 150)]
      expect(calculateTrailingTwelveMonthReturn(points)).toBeNull()
    })

    it.each([
      ['the start date', [point('2024-01-15', 100), point('2024-01-15', 10), point('2025-01-15', 150)]],
      ['the end date', [point('2024-01-15', 100), point('2025-01-15', 150), point('2025-01-15', 300)]],
    ])(
      'stays order-independent when two points share %s',
      (_label, points) => {
        // Duplicate dates are a data defect; the guarantee is only that the
        // answer does not change with the ordering of the input.
        expect(calculateTrailingTwelveMonthReturn(points)).toBe(
          calculateTrailingTwelveMonthReturn([...points].reverse()),
        )
      },
    )
  })
})
