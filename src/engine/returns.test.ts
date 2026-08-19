import { describe, expect, it } from 'vitest'
import { annualise, maxDrawdown, returnBetween, windowReturn } from './returns.ts'
import { WINDOWS } from '../domain/windows.ts'

/** A series that compounds at a fixed daily rate, so returns are exact. */
function compounding(days: number, dailyRate: number, start = 100): (number | null)[] {
  return Array.from({ length: days }, (_, i) => start * (1 + dailyRate) ** i)
}

describe('windowReturn', () => {
  it('measures the formation window, ending before the skip', () => {
    // 300 days at +0.1%/day. 12−1 measures days 47…299−21=278.
    const closes = compounding(300, 0.001)
    const r = windowReturn(closes, WINDOWS['12-1'])
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBeCloseTo(1.001 ** 252 - 1, 10)
  })

  it('skip: 0 measures right up to the evaluation point', () => {
    const closes = compounding(300, 0.001)
    const r = windowReturn(closes, WINDOWS['12M'])
    expect(r.ok && r.value).toBeCloseTo(1.001 ** 252 - 1, 10)
  })

  it('gives the same answer for 12−1 as an explicit endpoint ratio', () => {
    const closes = compounding(400, 0.0007)
    const end = 399 - 21
    const start = end - 252
    const expected = (closes[end] as number) / (closes[start] as number) - 1
    expect((windowReturn(closes, WINDOWS['12-1']) as { value: number }).value).toBeCloseTo(
      expected,
      12,
    )
  })

  it('refuses a window that runs off the front of the history', () => {
    // 200 days cannot contain a 252-day formation plus a 21-day skip.
    const r = windowReturn(compounding(200, 0.001), WINDOWS['12-1'])
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('insufficient-history')
  })

  it('is available at exactly the minimum history and not one day less', () => {
    const need = WINDOWS['12-1'].formation + WINDOWS['12-1'].skip + 1
    expect(windowReturn(compounding(need, 0.001), WINDOWS['12-1']).ok).toBe(true)
    expect(windowReturn(compounding(need - 1, 0.001), WINDOWS['12-1']).ok).toBe(false)
  })

  it('tolerates a short gap at an endpoint', () => {
    const closes = compounding(300, 0.001)
    closes[300 - 1 - 21] = null
    closes[300 - 1 - 21 - 1] = null
    expect(windowReturn(closes, WINDOWS['12-1']).ok).toBe(true)
  })

  it('reports no-observation when an endpoint is missing beyond tolerance', () => {
    const closes = compounding(300, 0.001)
    for (let i = 300 - 1 - 21; i > 300 - 1 - 21 - 8; i--) closes[i] = null
    const r = windowReturn(closes, WINDOWS['12-1'])
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('no-observation')
  })

  it('ignores trailing gaps by anchoring on the last real print', () => {
    const closes = compounding(300, 0.001)
    closes[299] = null
    closes[298] = null
    const r = windowReturn(closes, WINDOWS['12M'])
    expect(r.ok).toBe(true)
  })

  it('accepts an explicit evaluation point, which is how prior values are built', () => {
    const closes = compounding(400, 0.001)
    const now = windowReturn(closes, WINDOWS['12M'])
    const then = windowReturn(closes, WINDOWS['12M'], 399 - 63)
    // Constant compounding: the same window length gives the same return
    // wherever it is anchored.
    expect(now.ok && then.ok && then.value).toBeCloseTo((now as { value: number }).value, 10)
  })

  it('treats zero and negative prints as absent, not as prices', () => {
    const closes = compounding(300, 0.001)
    closes[299 - 21] = 0
    closes[299 - 21 - 1] = -5
    const r = windowReturn(closes, WINDOWS['12-1'])
    // Pulled back two days rather than dividing by a zero close.
    expect(r.ok).toBe(true)
    expect(Number.isFinite((r as { value: number }).value)).toBe(true)
  })

  it('has nothing to say about an empty series', () => {
    const r = windowReturn([null, null, null], WINDOWS['3M'])
    expect(!r.ok && r.reason).toBe('no-observation')
  })

  it('scales to a shorter horizon with no change beyond the window numbers', () => {
    const closes = compounding(100, 0.002)
    const r = windowReturn(closes, WINDOWS['3M'])
    expect(r.ok && r.value).toBeCloseTo(1.002 ** 63 - 1, 10)
  })
})

describe('returnBetween', () => {
  it('measures between two explicit indices', () => {
    const closes = [100, 105, 110, 120]
    expect((returnBetween(closes, 0, 3) as { value: number }).value).toBeCloseTo(0.2, 12)
  })

  it('rejects a reversed or empty range', () => {
    expect(returnBetween([100, 110], 1, 1).ok).toBe(false)
    expect(returnBetween([100, 110], 1, 0).ok).toBe(false)
  })
})

describe('annualise', () => {
  it('scales a part-year return to a yearly rate', () => {
    expect((annualise(0.1, 126) as { value: number }).value).toBeCloseTo(1.1 ** 2 - 1, 10)
  })

  it('is the identity over a full trading year', () => {
    expect((annualise(0.37, 252) as { value: number }).value).toBeCloseTo(0.37, 10)
  })

  it('refuses to annualise a total loss', () => {
    expect(annualise(-1, 126).ok).toBe(false)
    expect(annualise(0.1, 0).ok).toBe(false)
  })
})

describe('maxDrawdown', () => {
  it('finds the deepest peak-to-trough fall', () => {
    const closes = [
      ...Array.from({ length: 100 }, () => 100),
      ...Array.from({ length: 100 }, () => 60),
      ...Array.from({ length: 53 }, () => 80),
    ]
    const r = maxDrawdown(closes, 252)
    expect(r.ok && r.value).toBeCloseTo(-0.4, 10)
  })

  it('is zero for a series that only rises', () => {
    const closes = Array.from({ length: 260 }, (_, i) => 100 + i)
    expect((maxDrawdown(closes, 252) as { value: number }).value).toBe(0)
  })

  it('needs a populated window, not a handful of prints', () => {
    const sparse: (number | null)[] = Array.from({ length: 260 }, () => null)
    sparse[0] = 100
    sparse[259] = 50
    expect(maxDrawdown(sparse, 252).ok).toBe(false)
  })

  it('refuses a lookback longer than the history', () => {
    expect(maxDrawdown(Array.from({ length: 50 }, () => 10), 252).ok).toBe(false)
  })
})
