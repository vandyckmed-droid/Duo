import { describe, expect, it } from 'vitest'
import { parsePriceData } from './loadPriceData.ts'

const valid = {
  generatedAt: '2025-01-02',
  dates: ['2025-01-01', '2025-01-02'],
  series: { AAA: [100, 110] },
  benchmark: { ticker: 'IJH', closes: [50, 52] },
}

describe('parsePriceData', () => {
  it('parses the calendar once into a shared timestamp index', () => {
    const data = parsePriceData(valid)

    expect(data.timestamps).toEqual([
      Date.UTC(2025, 0, 1),
      Date.UTC(2025, 0, 2),
    ])
    // Every series points at the same array, not a copy per ticker.
    expect(data.series.AAA.timestamps).toBe(data.timestamps)
  })

  it('keeps gaps as nulls rather than dropping them', () => {
    const data = parsePriceData({ ...valid, series: { AAA: [null, 110] } })
    expect(data.series.AAA.closes).toEqual([null, 110])
  })

  it.each([
    ['an unusable date', { ...valid, dates: ['2025-01-01', 'not-a-date'] }],
    ['dates out of order', { ...valid, dates: ['2025-01-02', '2025-01-01'] }],
    ['a duplicated date', { ...valid, dates: ['2025-01-01', '2025-01-01'] }],
  ])('rejects %s', (_label, file) => {
    expect(() => parsePriceData(file)).toThrow()
  })

  it('rejects a series that does not line up with the calendar', () => {
    expect(() => parsePriceData({ ...valid, series: { AAA: [100] } })).toThrow(
      /does not match the calendar/,
    )
  })

  it('rejects a malformed file rather than returning an empty dataset', () => {
    // A half-built dataset would silently rank nothing; failing is louder.
    expect(() => parsePriceData({} as never)).toThrow(/malformed/)
  })

  it('exposes the benchmark on the shared calendar', () => {
    const data = parsePriceData(valid)

    expect(data.benchmark.ticker).toBe('IJH')
    expect(data.benchmark.series.timestamps).toBe(data.timestamps)
    expect(data.benchmark.series.closes).toEqual([50, 52])
  })

  it('keeps the benchmark out of the rankable series', () => {
    // Ranking iterates the universe, but a benchmark sitting in `series`
    // would be one bad loop away from appearing as a constituent.
    expect(Object.keys(parsePriceData(valid).series)).toEqual(['AAA'])
  })

  it.each([
    ['a missing benchmark', { ...valid, benchmark: undefined }],
    [
      'a benchmark off the calendar',
      { ...valid, benchmark: { ticker: 'IJH', closes: [50] } },
    ],
  ])('rejects %s', (_label, file) => {
    expect(() => parsePriceData(file as never)).toThrow()
  })
})
