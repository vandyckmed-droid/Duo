import { describe, expect, it } from 'vitest'
import { parseIsoDateToUtc } from './isoDate.ts'

describe('parseIsoDateToUtc', () => {
  it('parses a bare ISO date as UTC midnight', () => {
    expect(parseIsoDateToUtc('2024-01-15')).toBe(Date.UTC(2024, 0, 15))
  })

  it.each([
    ['a T separator', '2024-01-15T00:00:00Z'],
    ['a T separator with offset', '2024-01-15T09:30:00-05:00'],
    ['a space separator', '2024-01-15 10:30:00'],
  ])('reads the date from a datetime with %s', (_label, value) => {
    expect(parseIsoDateToUtc(value)).toBe(Date.UTC(2024, 0, 15))
  })

  it.each([
    ['trailing digits', '2024-01-159'],
    ['a trailing fragment', '2024-01-15-99'],
    ['trailing text', '2024-01-15garbage'],
    ['unparseable text', 'not-a-date'],
    ['an empty string', ''],
    ['a slash-separated date', '2024/01/15'],
  ])('rejects %s', (_label, value) => {
    expect(parseIsoDateToUtc(value)).toBeNull()
  })

  it.each([
    ['a day past the end of the month', '2023-02-30'],
    ['a 31st in a 30-day month', '2024-04-31'],
    ['month zero', '2024-00-15'],
    ['month thirteen', '2023-13-01'],
    ['day zero', '2024-01-00'],
  ])('rejects %s rather than letting Date.UTC roll it forward', (_l, value) => {
    expect(parseIsoDateToUtc(value)).toBeNull()
  })

  it('rejects a two-digit year instead of shifting it into the 1900s', () => {
    // Date.UTC(50, ...) means 1950. A four-digit year is required, so this
    // fails the pattern outright rather than silently becoming 1950.
    expect(parseIsoDateToUtc('50-01-15')).toBeNull()
  })

  it('accepts a genuine four-digit year below 1970', () => {
    expect(parseIsoDateToUtc('1969-07-20')).toBe(Date.UTC(1969, 6, 20))
  })

  it('accepts 29 February in a leap year', () => {
    expect(parseIsoDateToUtc('2024-02-29')).toBe(Date.UTC(2024, 1, 29))
  })

  it('rejects 29 February in a non-leap year', () => {
    expect(parseIsoDateToUtc('2023-02-29')).toBeNull()
  })
})
