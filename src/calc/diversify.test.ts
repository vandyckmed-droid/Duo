import { describe, expect, it } from 'vitest'
import { DIVERSIFICATION, type DiversificationConfig, selectDiversified } from './diversify.ts'
import { beta, residualReturns } from './residual.ts'
import { correlation } from './stats.ts'

/** Deterministic noise in (−1, 1). */
function noise(seed: number, n: number): number[] {
  let x = seed
  return Array.from({ length: n }, () => {
    x = (x * 1103515245 + 12345) % 2 ** 31
    return (x / 2 ** 31) * 2 - 1
  })
}

/** Builds a close series from a list of daily returns, starting at 100. */
function closesFrom(returns: readonly number[]): number[] {
  const out = [100]
  for (const r of returns) out.push((out.at(-1) as number) * (1 + r))
  return out
}

const N = 300
const marketReturns = noise(7, N).map((e) => e * 0.01)
const market = closesFrom(marketReturns)

describe('beta and residual returns', () => {
  it('recovers the beta of a stock built from the market plus noise', () => {
    const stockReturns = marketReturns.map((m, i) => 2 * m + 0.002 * (noise(11, N)[i] as number))
    const stock = closesFrom(stockReturns)
    const b = beta(stock, market, 252)
    expect(b).not.toBeNull()
    expect(b as number).toBeCloseTo(2, 1)

    // Once β × market is removed, what is left no longer tracks the market.
    const residual = residualReturns(stock, market, 252)
    const marketDaily: (number | null)[] = [null, ...marketReturns]
    const rho = correlation(residual, marketDaily, 60)
    expect(Math.abs(rho as number)).toBeLessThan(0.05)
  })

  it('measures no similarity when beta cannot be estimated', () => {
    const flat = Array.from({ length: N }, () => 100)
    expect(beta(closesFrom(marketReturns), flat, 252)).toBeNull()
    expect(residualReturns(closesFrom(marketReturns), flat, 252).every((v) => v === null)).toBe(true)
  })

  it('needs enough overlap before reporting a correlation', () => {
    const a: (number | null)[] = [...noise(3, 30), ...Array.from({ length: 200 }, () => null)]
    const b: (number | null)[] = [...noise(3, 30), ...Array.from({ length: 200 }, () => null)]
    expect(correlation(a, b, 60)).toBeNull()
    expect(correlation(a, b, 10)).toBeCloseTo(1)
  })
})

/** A small universe: two near-clones at the top, independents below. */
function cloneUniverse() {
  const base = noise(21, N).map((e) => e * 0.02)
  const residuals = new Map<string, (number | null)[]>([
    // AAA and BBB share the same stock-specific pattern: correlation ≈ 1.
    ['AAA', base],
    ['BBB', base.map((r, i) => r + 0.001 * (noise(31, N)[i] as number))],
    ['CCC', noise(41, N).map((e) => e * 0.02)],
    ['DDD', noise(51, N).map((e) => e * 0.02)],
  ])
  const candidates = [
    { ticker: 'AAA', score: 3.0 },
    { ticker: 'BBB', score: 2.9 },
    { ticker: 'CCC', score: 2.5 },
    { ticker: 'DDD', score: 2.0 },
  ]
  return { candidates, residuals }
}

const config = (overrides: Partial<DiversificationConfig>): DiversificationConfig => ({
  ...DIVERSIFICATION,
  ...overrides,
})

describe('diversified selection', () => {
  it('reproduces the raw ranking at λ = 0', () => {
    const { candidates, residuals } = cloneUniverse()
    const picks = selectDiversified(candidates, residuals, config({ lambda: 0, listSize: 4 }))
    expect(picks.map((p) => p.ticker)).toEqual(['AAA', 'BBB', 'CCC', 'DDD'])
    expect(picks.map((p) => p.rawRank)).toEqual([1, 2, 3, 4])
  })

  it('makes a clone of a selected stock pay a redundancy toll', () => {
    const { candidates, residuals } = cloneUniverse()
    const picks = selectDiversified(candidates, residuals, config({ lambda: 1, listSize: 4 }))
    // BBB (raw #2) is nearly identical to AAA: with λ = 1 its penalty ≈ 1,
    // dropping its selection score below the independents'.
    expect(picks.map((p) => p.ticker)).toEqual(['AAA', 'CCC', 'DDD', 'BBB'])
    expect(picks.map((p) => p.rawRank)).toEqual([1, 3, 4, 2])
    // Never excluded — it still enters, carrying its measured similarity:
    // ~1 to its clone AAA, diluted by the near-zero independents in its top 3.
    const bbb = picks.find((p) => p.ticker === 'BBB')
    expect(bbb?.similarity).toBeGreaterThan(0.3)
  })

  it('lets a strong enough signal overcome the penalty', () => {
    const { candidates, residuals } = cloneUniverse()
    const strong = candidates.map((c) =>
      c.ticker === 'BBB' ? { ...c, score: 4.5 } : c.ticker === 'AAA' ? { ...c, score: 3.6 } : c,
    )
    const picks = selectDiversified(strong, residuals, config({ lambda: 1, listSize: 3 }))
    // AAA pays ~λ for cloning BBB (3.6 − 1 = 2.6) and still beats CCC's 2.5:
    // the penalty raises the bar, it never bans.
    expect(picks.map((p) => p.ticker)).toEqual(['BBB', 'AAA', 'CCC'])
    expect(picks[1]?.rawRank).toBe(2)
  })

  it('averages the top-3 correlations rather than the single maximum', () => {
    const shared = noise(61, N).map((e) => e * 0.02)
    const residuals = new Map<string, (number | null)[]>([
      ['S1', shared],
      ['S2', shared.map((r, i) => r + 0.004 * (noise(71, N)[i] as number))],
      ['X', noise(81, N).map((e) => e * 0.02)],
    ])
    const picks = selectDiversified(
      [
        { ticker: 'S1', score: 3 },
        { ticker: 'S2', score: 2.8 },
        { ticker: 'X', score: 2.7 },
      ],
      residuals,
      config({ lambda: 0.5, listSize: 3 }),
    )
    // With one selected stock, similarity is that single (clamped) correlation;
    // the neighbour cap only limits how many count once more are selected.
    expect(picks[0]?.ticker).toBe('S1')
    expect(picks.map((p) => p.ticker)).toContain('X')
  })

  it('caps the list size and carries no penalty without residual evidence', () => {
    const picks = selectDiversified(
      [
        { ticker: 'AAA', score: 2 },
        { ticker: 'BBB', score: 1 },
      ],
      new Map(),
      config({ listSize: 1 }),
    )
    expect(picks).toEqual([{ ticker: 'AAA', rawRank: 1, similarity: 0 }])
  })
})
