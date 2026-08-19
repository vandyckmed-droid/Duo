import { describe, expect, it } from 'vitest'
import { realisedVolatility, returnPerVol, stdev } from './volatility.ts'
import { missing, ok } from './types.ts'

describe('stdev', () => {
  it('uses the sample denominator', () => {
    // Population sd of [2,4,4,4,5,5,7,9] is 2; the sample sd is larger.
    expect((stdev([2, 4, 4, 4, 5, 5, 7, 9]) as { value: number }).value).toBeCloseTo(
      Math.sqrt(32 / 7),
      12,
    )
  })

  it('has nothing to measure with fewer than two points', () => {
    expect(stdev([]).ok).toBe(false)
    expect(stdev([5]).ok).toBe(false)
  })
})

describe('realisedVolatility', () => {
  it('annualises daily dispersion by √252', () => {
    // Alternating ±1% gives a daily sd that is exactly computable.
    const closes: number[] = [100]
    for (let i = 1; i < 300; i++) {
      closes.push((closes[i - 1] as number) * (i % 2 === 0 ? 1.01 : 0.99))
    }
    const r = realisedVolatility(closes, 252)
    expect(r.ok).toBe(true)
    expect((r as { value: number }).value).toBeGreaterThan(0.14)
    expect((r as { value: number }).value).toBeLessThan(0.17)
  })

  it('is zero for a series that never moves', () => {
    const flat = Array.from({ length: 300 }, () => 50)
    expect((realisedVolatility(flat, 252) as { value: number }).value).toBeCloseTo(0, 12)
  })

  it('refuses a window longer than the history', () => {
    expect(realisedVolatility(Array.from({ length: 100 }, () => 10), 252).ok).toBe(false)
  })

  it('refuses a window that is mostly holes', () => {
    // Estimating a "1-year" volatility from 30 scattered days would label a
    // different, shorter sample with the same name and rank it against the rest.
    const sparse: (number | null)[] = Array.from({ length: 300 }, (_, i) =>
      i % 10 === 0 ? 100 + i : null,
    )
    expect(realisedVolatility(sparse, 252).ok).toBe(false)
  })

  it('is available at exactly the minimum history', () => {
    const closes = Array.from({ length: 253 }, (_, i) => 100 + (i % 7))
    expect(realisedVolatility(closes, 252).ok).toBe(true)
    expect(realisedVolatility(closes.slice(1), 252).ok).toBe(false)
  })
})

describe('returnPerVol', () => {
  it('divides return by volatility', () => {
    expect((returnPerVol(ok(0.3), ok(0.2)) as { value: number }).value).toBeCloseTo(1.5, 12)
  })

  it('keeps a negative return negative rather than hiding it', () => {
    expect((returnPerVol(ok(-0.3), ok(0.2)) as { value: number }).value).toBeCloseTo(-1.5, 12)
  })

  it('propagates whichever input was unavailable', () => {
    expect(returnPerVol(missing('insufficient-history'), ok(0.2)).ok).toBe(false)
    expect(returnPerVol(ok(0.2), missing('no-observation')).ok).toBe(false)
  })

  it('refuses to divide by a dead feed', () => {
    const r = returnPerVol(ok(0.3), ok(0))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('invalid-observation')
  })
})
