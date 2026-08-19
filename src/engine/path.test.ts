import { describe, expect, it } from 'vitest'
import {
  distanceFromHigh,
  downsideDeviation,
  positiveDayShare,
  timeNearHigh,
  topDayConcentration,
} from './path.ts'

/** A series that compounds at a fixed daily rate, so returns are exact. */
function compounding(days: number, dailyRate: number, start = 100): (number | null)[] {
  return Array.from({ length: days }, (_, i) => start * (1 + dailyRate) ** i)
}

/** A series that alternates up and down by a fixed rate. */
function sawtooth(days: number, rate: number, start = 100): (number | null)[] {
  const out: (number | null)[] = [start]
  for (let i = 1; i < days; i++) {
    const prev = out[i - 1] as number
    out.push(i % 2 === 0 ? prev * (1 + rate) : prev * (1 - rate))
  }
  return out
}

describe('positiveDayShare', () => {
  it('is 1 for a series that only rises', () => {
    const r = positiveDayShare(compounding(300, 0.001), 252)
    expect(r.ok && r.value).toBe(1)
  })

  it('is near a half for an alternating series', () => {
    const r = positiveDayShare(sawtooth(300, 0.01), 252)
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBeGreaterThan(0.45)
    expect(r.ok && r.value).toBeLessThan(0.55)
  })

  it('refuses a window that runs off the front of the history', () => {
    const r = positiveDayShare(compounding(100, 0.001), 252)
    expect(!r.ok && r.reason).toBe('insufficient-history')
  })

  it('refuses when gaps push coverage below the floor', () => {
    const closes = compounding(300, 0.001)
    for (let i = 40; i < 190; i++) closes[i] = null
    const r = positiveDayShare(closes, 252)
    expect(!r.ok && r.reason).toBe('insufficient-history')
  })

  it('anchors at evaluatedAt rather than the end of the series', () => {
    // Rises for 300 days, then falls for 100. Evaluated at day 299 the
    // window sees only the rise.
    const closes = compounding(300, 0.002)
    for (let i = 300; i < 400; i++) closes.push((closes[i - 1] as number) * 0.99)
    const late = positiveDayShare(closes, 252)
    const early = positiveDayShare(closes, 252, 299)
    expect(early.ok && early.value).toBe(1)
    expect(late.ok && late.value).toBeLessThan(1)
  })
})

describe('topDayConcentration', () => {
  it('is low for a steady climb', () => {
    // 252 equal up-days: the top 5 contribute exactly 5/252 of the move.
    const r = topDayConcentration(compounding(300, 0.001), 252, 5)
    expect(r.ok && r.value).toBeCloseTo(5 / 252, 10)
  })

  it('is high when the move lives in one gap', () => {
    // Flat except one +50% day inside the window.
    const closes: (number | null)[] = Array.from({ length: 300 }, () => 100)
    for (let i = 200; i < 300; i++) closes[i] = 150
    const r = topDayConcentration(closes, 252, 5)
    expect(r.ok && r.value).toBeCloseTo(1, 10)
  })

  it('is undefined over a losing window', () => {
    const r = topDayConcentration(compounding(300, -0.001), 252, 5)
    expect(!r.ok && r.reason).toBe('invalid-observation')
  })

  it('refuses a k as large as the sample', () => {
    const r = topDayConcentration(compounding(300, 0.001), 252, 252)
    expect(r.ok).toBe(false)
  })
})

describe('distanceFromHigh', () => {
  it('is 1 when the evaluation day is the high', () => {
    const r = distanceFromHigh(compounding(300, 0.001), 252)
    expect(r.ok && r.value).toBe(1)
  })

  it('measures the fall from a mid-window peak', () => {
    const closes = compounding(280, 0.001)
    for (let i = 280; i < 300; i++) closes.push((closes[i - 1] as number) * 0.99)
    const peak = closes[279] as number
    const last = closes[299] as number
    const r = distanceFromHigh(closes, 252)
    expect(r.ok && r.value).toBeCloseTo(last / peak, 10)
  })

  it('never sees a high after the evaluation day', () => {
    // A huge later peak must not affect an earlier evaluation.
    const closes = compounding(300, 0.001)
    closes.push(1000)
    const r = distanceFromHigh(closes, 252, 299)
    expect(r.ok && r.value).toBe(1)
  })

  it('refuses insufficient history', () => {
    expect(distanceFromHigh(compounding(100, 0.001), 252).ok).toBe(false)
  })
})

describe('timeNearHigh', () => {
  it('is 1 for a steady climb that is always at its high', () => {
    const r = timeNearHigh(compounding(400, 0.001), 252, 63, 0.05)
    expect(r.ok && r.value).toBe(1)
  })

  it('is 0 for a name far below a high set before the recent span', () => {
    // High plateau, then a deep fall, then flat: recent days sit far below
    // the trailing-252 high for the whole recent span.
    const closes: (number | null)[] = []
    for (let i = 0; i < 340; i++) closes.push(200)
    for (let i = 0; i < 63; i++) closes.push(100)
    const r = timeNearHigh(closes, 252, 63, 0.05)
    expect(r.ok && r.value).toBe(0)
  })

  it('counts only days within the band', () => {
    // 40 recent days at the high, 23 recent days 10% below it.
    const closes: (number | null)[] = []
    for (let i = 0; i < 340; i++) closes.push(200)
    for (let i = 0; i < 23; i++) closes.push(180)
    for (let i = 0; i < 40; i++) closes.push(200)
    const r = timeNearHigh(closes, 252, 63, 0.05)
    expect(r.ok && r.value).toBeCloseTo(40 / 63, 10)
  })

  it('refuses insufficient history', () => {
    expect(timeNearHigh(compounding(200, 0.001), 252, 63, 0.05).ok).toBe(false)
  })
})

describe('downsideDeviation', () => {
  it('is 0 for a series that never falls', () => {
    const r = downsideDeviation(compounding(300, 0.001), 252)
    expect(r.ok && r.value).toBe(0)
  })

  it('sees only the losing half of a sawtooth', () => {
    const r = downsideDeviation(sawtooth(600, 0.01), 252)
    expect(r.ok).toBe(true)
    // Half the days lose ~1%: rms of {0…, −0.01…} ≈ 0.01/√2, annualised.
    const expected = 0.01 * Math.sqrt(0.5) * Math.sqrt(252)
    expect(r.ok && r.value).toBeGreaterThan(expected * 0.9)
    expect(r.ok && r.value).toBeLessThan(expected * 1.1)
  })

  it('is lower than total volatility would be for the same series', () => {
    const closes = sawtooth(600, 0.01)
    const dd = downsideDeviation(closes, 252)
    // Total sawtooth vol ≈ 0.01·√252; downside uses only half the days.
    expect(dd.ok && dd.value).toBeLessThan(0.01 * Math.sqrt(252))
  })

  it('refuses insufficient history', () => {
    expect(downsideDeviation(compounding(100, 0.001), 252).ok).toBe(false)
  })
})
