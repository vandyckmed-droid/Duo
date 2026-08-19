import { describe, expect, it } from 'vitest'
import { MIN_REGRESSION_OBSERVATIONS, beta, ols } from './regression.ts'

const noise = (i: number) => Math.sin(i * 1.7) * 0.004 + Math.cos(i * 0.31) * 0.003

describe('ols', () => {
  it('recovers a known slope and intercept', () => {
    const x = Array.from({ length: 500 }, (_, i) => noise(i))
    const y = x.map((v) => 0.0002 + 1.4 * v)
    const r = ols(y, x)
    expect(r.ok).toBe(true)
    expect((r as { value: { beta: number } }).value.beta).toBeCloseTo(1.4, 8)
    expect((r as { value: { alpha: number } }).value.alpha).toBeCloseTo(0.0002, 8)
    expect((r as { value: { rSquared: number } }).value.rSquared).toBeCloseTo(1, 8)
  })

  it('fits with an intercept, so drift does not leak into the slope', () => {
    const x = Array.from({ length: 500 }, (_, i) => noise(i))
    const drifted = x.map((v) => 0.01 + 1.0 * v)
    const r = ols(drifted, x)
    // Through-the-origin the slope would be pulled far above 1 by the drift.
    expect((r as { value: { beta: number } }).value.beta).toBeCloseTo(1.0, 8)
    expect((r as { value: { alpha: number } }).value.alpha).toBeCloseTo(0.01, 8)
  })

  it('needs enough paired days to be an estimate rather than noise', () => {
    const n = MIN_REGRESSION_OBSERVATIONS - 1
    const x = Array.from({ length: n }, (_, i) => noise(i))
    const r = ols(x.map((v) => 2 * v), x)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('insufficient-overlap')
  })

  it('refuses a benchmark that never moves', () => {
    const x = Array.from({ length: 200 }, () => 0)
    const y = Array.from({ length: 200 }, (_, i) => noise(i))
    const r = ols(y, x)
    expect(!r.ok && r.reason).toBe('degenerate-benchmark')
  })

  it('counts only the paired observations it actually used', () => {
    const x = Array.from({ length: 300 }, (_, i) => noise(i))
    const r = ols(x.map((v) => v), x)
    expect((r as { value: { observations: number } }).value.observations).toBe(300)
  })
})

describe('beta', () => {
  const build = (rates: number[]) => {
    const out = [100]
    for (const r of rates) out.push((out[out.length - 1] as number) * (1 + r))
    return out
  }

  it('estimates the slope from aligned daily returns', () => {
    const market = Array.from({ length: 800 }, (_, i) => noise(i))
    const stock = market.map((r) => 1.6 * r)
    const r = beta(build(stock), build(market), 756)
    expect((r as { value: { beta: number } }).value.beta).toBeCloseTo(1.6, 6)
  })

  it('only uses days on which both traded', () => {
    const market = Array.from({ length: 800 }, (_, i) => noise(i))
    const stockCloses = build(market.map((r) => 1.2 * r))
    // Knock out a stretch of the stock's prints; the pairs simply disappear.
    for (let i = 300; i < 340; i++) stockCloses[i] = null as unknown as number
    const r = beta(stockCloses as (number | null)[], build(market), 756)
    expect(r.ok).toBe(true)
    expect((r as { value: { beta: number } }).value.beta).toBeCloseTo(1.2, 6)
    expect((r as { value: { observations: number } }).value.observations).toBeLessThan(756)
  })

  it('is unavailable when the overlap is too thin', () => {
    const market = build(Array.from({ length: 800 }, (_, i) => noise(i)))
    const stock: (number | null)[] = Array.from({ length: 801 }, () => null)
    for (let i = 0; i < 40; i++) stock[i] = 100 + i
    expect(beta(stock, market, 756).ok).toBe(false)
  })
})
