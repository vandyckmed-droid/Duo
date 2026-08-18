import { describe, expect, it } from 'vitest'
import { subtractCalendarMonths } from './calendar.ts'

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d)

describe('subtractCalendarMonths', () => {
  it.each([
    ['twelve months', utc(2025, 1, 15), 12, utc(2024, 1, 15)],
    ['one month', utc(2025, 1, 15), 1, utc(2024, 12, 15)],
    ['zero months', utc(2025, 1, 15), 0, utc(2025, 1, 15)],
    ['across a year boundary', utc(2025, 3, 10), 5, utc(2024, 10, 10)],
    ['more than a year', utc(2025, 6, 30), 25, utc(2023, 5, 30)],
  ])('subtracts %s', (_label, from, months, expected) => {
    expect(subtractCalendarMonths(from, months)).toBe(expected)
  })

  it('clamps 29 February to 28 February of a non-leap year', () => {
    expect(subtractCalendarMonths(utc(2024, 2, 29), 12)).toBe(utc(2023, 2, 28))
  })

  it('keeps 29 February when the target year is also a leap year', () => {
    expect(subtractCalendarMonths(utc(2024, 2, 29), 48)).toBe(utc(2020, 2, 29))
  })

  it.each([
    ['31 March back one month', utc(2025, 3, 31), 1, utc(2025, 2, 28)],
    ['31 May back one month', utc(2025, 5, 31), 1, utc(2025, 4, 30)],
    ['31 March in a leap year', utc(2024, 3, 31), 1, utc(2024, 2, 29)],
  ])('clamps %s to the last day of the target month', (_l, from, m, want) => {
    expect(subtractCalendarMonths(from, m)).toBe(want)
  })

  it('never rolls an overflowing day forward into the next month', () => {
    // Date.UTC would turn 31 April into 1 May; clamping keeps it in April.
    const result = new Date(subtractCalendarMonths(utc(2025, 5, 31), 1))
    expect(result.getUTCMonth()).toBe(3)
  })
})
