import { describe, expect, it } from 'vitest'
import { beta } from './regression.ts'
import { residualReturn, residualVolatility } from './residual.ts'
import { windowReturn } from './returns.ts'
import { WINDOWS } from '../domain/windows.ts'
import { missing, ok } from './types.ts'

const noise = (i: number) => Math.sin(i * 1.3) * 0.006 + Math.cos(i * 0.47) * 0.004

function build(rates: readonly number[], start = 100): number[] {
  const out = [start]
  for (const r of rates) out.push((out[out.length - 1] as number) * (1 + r))
  return out
}

describe('residualReturn', () => {
  const marketRates = Array.from({ length: 900 }, (_, i) => noise(i))
  const market = build(marketRates)

  it('subtracts β × the benchmark return over the same window', () => {
    const stock = build(marketRates.map((r) => 1.5 * r + 0.0003))
    const b = beta(stock, market, 756)
    const r = residualReturn(stock, market, b, WINDOWS['12M'])

    const stockReturn = (windowReturn(stock, WINDOWS['12M']) as { value: number }).value
    const marketReturn = (windowReturn(market, WINDOWS['12M']) as { value: number }).value
    const expected =
      stockReturn - (b as { value: { beta: number } }).value.beta * marketReturn
    expect((r as { value: number }).value).toBeCloseTo(expected, 12)
  })

  it('does not subtract alpha, so persistent outperformance survives', () => {
    // Pure benchmark exposure plus a steady daily drift: β is 1, and the
    // residual must come back as roughly the accumulated drift rather than 0.
    const drift = 0.0004
    const stock = build(marketRates.map((r) => r + drift))
    const b = beta(stock, market, 756)
    expect((b as { value: { beta: number } }).value.beta).toBeCloseTo(1, 3)

    const r = residualReturn(stock, market, b, WINDOWS['12M'])
    expect((r as { value: number }).value).toBeGreaterThan(0.05)
  })

  it('is ~0 for a name that is exactly its benchmark', () => {
    const r = residualReturn(market, market, beta(market, market, 756), WINDOWS['12M'])
    expect((r as { value: number }).value).toBeCloseTo(0, 10)
  })

  it('is unavailable when beta is', () => {
    const stock = build(marketRates)
    const r = residualReturn(stock, market, missing('insufficient-overlap'), WINDOWS['12M'])
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('insufficient-overlap')
  })

  it('is unavailable when the stock has no window', () => {
    const short = build(marketRates.slice(0, 100))
    const r = residualReturn(short, market, ok({ beta: 1 }), WINDOWS['12M'])
    expect(r.ok).toBe(false)
  })

  it('reports missing benchmark history as an overlap failure, not a stock failure', () => {
    const stock = build(marketRates)
    const shortBenchmark = build(marketRates.slice(0, 50))
    const r = residualReturn(stock, shortBenchmark, ok({ beta: 1 }), WINDOWS['12M'])
    expect(!r.ok && r.reason).toBe('insufficient-overlap')
  })

  it('a high-beta name in a rising market can still have a negative residual', () => {
    const rising = build(Array.from({ length: 900 }, (_, i) => noise(i) + 0.0005))
    const laggard = build(Array.from({ length: 900 }, (_, i) => 2 * (noise(i) + 0.0005) - 0.0006))
    const b = beta(laggard, rising, 756)
    const raw = (windowReturn(laggard, WINDOWS['12M']) as { value: number }).value
    const res = (residualReturn(laggard, rising, b, WINDOWS['12M']) as { value: number }).value
    expect(raw).toBeGreaterThan(0)
    expect(res).toBeLessThan(0)
  })
})

describe('residualVolatility', () => {
  const days = 400
  const bench = Array.from({ length: days }, (_, i) => 100 * 1.0004 ** i)

  it('is zero when the stock is exactly beta times the benchmark', () => {
    // Stock daily return = 2 × benchmark daily return, every day: with β = 2
    // the residual is identically zero, so its volatility is zero.
    const closes: (number | null)[] = [100]
    for (let i = 1; i < days; i++) {
      const rb = (bench[i] as number) / (bench[i - 1] as number) - 1
      closes.push((closes[i - 1] as number) * (1 + 2 * rb))
    }
    const r = residualVolatility(closes, bench, ok({ beta: 2 }), { formation: 252, skip: 21 })
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBeCloseTo(0, 10)
  })

  it('recovers a planted alternating residual', () => {
    // Residual alternates ±1% around β × benchmark: annualised residual vol
    // is close to 1% × √252.
    const closes: (number | null)[] = [100]
    for (let i = 1; i < days; i++) {
      const rb = (bench[i] as number) / (bench[i - 1] as number) - 1
      const noise = i % 2 === 0 ? 0.01 : -0.01
      closes.push((closes[i - 1] as number) * (1 + rb + noise))
    }
    const r = residualVolatility(closes, bench, ok({ beta: 1 }), { formation: 252, skip: 21 })
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBeGreaterThan(0.01 * Math.sqrt(252) * 0.95)
    expect(r.ok && r.value).toBeLessThan(0.01 * Math.sqrt(252) * 1.05)
  })

  it('fails when beta could not be estimated', () => {
    const r = residualVolatility(bench, bench, missing('insufficient-overlap'), {
      formation: 252,
      skip: 21,
    })
    expect(!r.ok && r.reason).toBe('insufficient-overlap')
  })

  it('refuses a window off the front of the history', () => {
    const r = residualVolatility(bench, bench, ok({ beta: 1 }), { formation: 500, skip: 21 })
    expect(r.ok).toBe(false)
  })

  it('refuses when overlap coverage is below the floor', () => {
    const gappy = bench.map((c, i) => (i > 100 && i < 320 ? null : c))
    const r = residualVolatility(gappy, bench, ok({ beta: 1 }), { formation: 252, skip: 21 })
    expect(!r.ok && r.reason).toBe('insufficient-overlap')
  })
})
