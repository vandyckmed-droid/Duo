import { describe, expect, it } from 'vitest'
import {
  alignedReturns,
  dailyReturns,
  endpointAt,
  firstValidIndex,
  isUsable,
  lastValidIndex,
  observationCount,
} from './series.ts'

describe('isUsable', () => {
  it('accepts only finite positive numbers', () => {
    expect(isUsable(12.5)).toBe(true)
    expect(isUsable(0)).toBe(false)
    expect(isUsable(-3)).toBe(false)
    expect(isUsable(Number.NaN)).toBe(false)
    expect(isUsable(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isUsable(null)).toBe(false)
    expect(isUsable(undefined)).toBe(false)
  })
})

describe('endpointAt', () => {
  const closes = [10, null, null, 13, 14, null]

  it('returns the observation when the target day traded', () => {
    const r = endpointAt(closes, 3)
    expect(r.ok && r.value).toEqual({ index: 3, close: 13 })
  })

  it('pulls back to the nearest earlier observation inside tolerance', () => {
    const r = endpointAt(closes, 2)
    expect(r.ok && r.value.index).toBe(0)
  })

  it('never reaches forward, which would leak future prices into a window', () => {
    const r = endpointAt([null, null, 50], 1, 5)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('no-observation')
  })

  it('gives up beyond the tolerance rather than measuring the wrong period', () => {
    const gapped = [10, null, null, null, null, null, null, 20]
    expect(endpointAt(gapped, 6, 5).ok).toBe(false)
    expect(endpointAt(gapped, 6, 6).ok).toBe(true)
  })

  it('rejects out-of-range indices', () => {
    expect(endpointAt(closes, -1).ok).toBe(false)
    expect(endpointAt(closes, 99).ok).toBe(false)
  })

  it('skips zero and negative prints as unusable', () => {
    const r = endpointAt([9, 0, -1], 2)
    expect(r.ok && r.value).toEqual({ index: 0, close: 9 })
  })
})

describe('valid index helpers', () => {
  it('finds the first and last usable observations', () => {
    const closes = [null, 5, 6, null, 8, null]
    expect(firstValidIndex(closes)).toBe(1)
    expect(lastValidIndex(closes)).toBe(4)
    expect(observationCount(closes)).toBe(3)
  })

  it('reports −1 for a series with nothing usable', () => {
    expect(firstValidIndex([null, 0, -2])).toBe(-1)
    expect(lastValidIndex([null, null])).toBe(-1)
  })
})

describe('dailyReturns', () => {
  it('computes returns between adjacent observations', () => {
    const r = dailyReturns([100, 110, 99])
    expect(r[0]).toBeNull()
    expect(r[1]).toBeCloseTo(0.1, 12)
    expect(r[2]).toBeCloseTo(-0.1, 12)
  })

  it('drops the pair that straddles a gap instead of booking a multi-day move', () => {
    // A ten-day gap posted as one "daily" return would inflate volatility for
    // the whole window it lands in.
    const r = dailyReturns([100, null, 130])
    expect(r[1]).toBeNull()
    expect(r[2]).toBeNull()
  })
})

describe('alignedReturns', () => {
  it('keeps only days on which both series traded', () => {
    const a = [100, 101, 102, 103, 104]
    const b = [50, 51, null, 53, 54]
    const { a: ra, b: rb } = alignedReturns(a, b)
    expect(ra).toHaveLength(2)
    expect(rb).toHaveLength(2)
  })

  it('honours the index range it is given', () => {
    const a = [10, 11, 12, 13]
    const b = [20, 22, 24, 26]
    expect(alignedReturns(a, b, 3, 3).a).toHaveLength(1)
  })

  it('returns nothing when the two series never overlap', () => {
    const a = [10, 11, null, null]
    const b = [null, null, 24, 26]
    expect(alignedReturns(a, b).a).toHaveLength(0)
  })
})
