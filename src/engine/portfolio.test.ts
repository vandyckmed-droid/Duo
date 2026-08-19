import { describe, expect, it } from 'vitest'
import { allocate } from './allocation.ts'
import {
  covarianceMatrix,
  portfolioVolatility,
  riskContributions,
  shrinkCovariance,
  toCorrelation,
} from './covariance.ts'
import { correlationDistance, hrpWeights, quasiDiagonal, cluster } from './hrp.ts'
import {
  averageCorrelation,
  correlation,
  correlationMatrix,
  quantile,
  sectorConcentration,
  summarise,
  synchronisedReturns,
} from './groupStats.ts'

/** Deterministic pseudo-random walk, so tests never depend on Math.random. */
function walk(seed: number, days: number, vol: number, drift = 0): number[] {
  let s = seed
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648 - 0.5
  }
  const closes = [100]
  for (let i = 0; i < days; i++) {
    closes.push((closes[i] as number) * (1 + drift + rand() * vol))
  }
  return closes
}

describe('group statistics', () => {
  it('leads with the split rather than an average that hides it', () => {
    const s = summarise([
      { id: 'A', value: 0.2 },
      { id: 'B', value: -0.2 },
      { id: 'C', value: 0.1 },
      { id: 'D', value: null },
    ])
    expect(s.count).toBe(4)
    expect(s.measured).toBe(3)
    expect(s.advancers).toBe(2)
    expect(s.decliners).toBe(1)
    expect(s.best?.id).toBe('A')
    expect(s.worst?.id).toBe('B')
  })

  it('reports nothing rather than zero for an empty group', () => {
    const s = summarise([])
    expect(s.average).toBeNull()
    expect(s.median).toBeNull()
    expect(s.dispersion).toBeNull()
  })

  it('computes an interquartile spread once there are four measured names', () => {
    const s = summarise(
      [0.1, 0.2, 0.3, 0.4].map((value, i) => ({ id: String(i), value })),
    )
    expect(s.median).toBeCloseTo(0.25, 12)
    expect(s.dispersion).toBeCloseTo(0.15, 12)
  })

  it('interpolates quantiles', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12)
    expect(quantile([5], 0.9)).toBe(5)
    expect(quantile([], 0.5)).toBeNull()
  })

  it('measures sector concentration with a Herfindahl index', () => {
    const one = sectorConcentration(['Tech', 'Tech', 'Tech'])
    expect(one.herfindahl).toBeCloseTo(1, 12)
    const spread = sectorConcentration(['Tech', 'Energy', 'Health', 'Utilities'])
    expect(spread.herfindahl).toBeCloseTo(0.25, 12)
    expect(spread.bySector).toHaveLength(4)
  })

  it('correlates a series perfectly with itself and inversely with its mirror', () => {
    const a = [0.01, -0.02, 0.03, -0.01, 0.02]
    expect((correlation(a, a) as { value: number }).value).toBeCloseTo(1, 10)
    expect((correlation(a, a.map((x) => -x)) as { value: number }).value).toBeCloseTo(-1, 10)
  })

  it('has no correlation with a flat line', () => {
    expect(correlation([0.01, 0.02, 0.03], [0, 0, 0]).ok).toBe(false)
  })

  it('keeps only days on which every member of the group traded', () => {
    const map = new Map<string, (number | null)[]>([
      ['A', [100, 101, 102, 103]],
      ['B', [50, 51, null, 53]],
    ])
    const { ids, days } = synchronisedReturns(map)
    expect(ids).toEqual(['A', 'B'])
    // Days 1 and 3 have a return for A; B's return at 2 and 3 is lost to the gap.
    expect(days).toBe(1)
  })

  it('averages the off-diagonal correlations', () => {
    const m = correlationMatrix([walkReturns(1), walkReturns(1), walkReturns(2)])
    expect(averageCorrelation(m)).not.toBeNull()
    expect(averageCorrelation([[1]])).toBeNull()
  })
})

function walkReturns(seed: number): number[] {
  const closes = walk(seed, 300, 0.02)
  return closes.slice(1).map((c, i) => c / (closes[i] as number) - 1)
}

describe('covariance', () => {
  it('puts each series own variance on the diagonal', () => {
    const rows = [walkReturns(1), walkReturns(2)]
    const cov = covarianceMatrix(rows)
    expect((cov[0] as number[])[0]).toBeGreaterThan(0)
    expect((cov[0] as number[])[1]).toBeCloseTo((cov[1] as number[])[0] as number, 15)
  })

  it('shrinkage leaves variances alone and pulls correlations together', () => {
    const rows = [walkReturns(1), walkReturns(2), walkReturns(3)]
    const sample = covarianceMatrix(rows)
    const shrunk = shrinkCovariance(sample, 1)
    for (let i = 0; i < 3; i++) {
      expect((shrunk[i] as number[])[i]).toBeCloseTo((sample[i] as number[])[i] as number, 15)
    }
    const corr = toCorrelation(shrunk)
    expect((corr[0] as number[])[1]).toBeCloseTo((corr[0] as number[])[2] as number, 10)
  })

  it('shrinkage at zero intensity is the sample matrix', () => {
    const sample = covarianceMatrix([walkReturns(4), walkReturns(5)])
    const shrunk = shrinkCovariance(sample, 0)
    expect((shrunk[0] as number[])[1]).toBeCloseTo((sample[0] as number[])[1] as number, 12)
  })

  it('risk contributions sum to one', () => {
    const cov = covarianceMatrix([walkReturns(1), walkReturns(2), walkReturns(3)])
    const w = [0.5, 0.3, 0.2]
    expect(riskContributions(w, cov).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('portfolio volatility of a single asset is its own volatility', () => {
    const cov = covarianceMatrix([walkReturns(7)])
    expect(portfolioVolatility([1], cov)).toBeCloseTo(
      Math.sqrt((cov[0] as number[])[0] as number),
      12,
    )
  })
})

describe('hierarchical risk parity', () => {
  it('maps correlation onto distance monotonically', () => {
    const d = correlationDistance([
      [1, 1, -1],
      [1, 1, 0],
      [-1, 0, 1],
    ])
    expect((d[0] as number[])[0]).toBe(0)
    expect((d[0] as number[])[1]).toBeCloseTo(0, 12)
    expect((d[1] as number[])[2]).toBeCloseTo(Math.sqrt(0.5), 12)
    expect((d[0] as number[])[2]).toBeCloseTo(1, 12)
  })

  it('orders correlated names next to each other', () => {
    // A and B are the same walk; C is unrelated. The ordering must not split
    // the pair.
    const rows = [walkReturns(11), walkReturns(11), walkReturns(29)]
    const order = quasiDiagonal(cluster(correlationDistance(correlationMatrix(rows))))
    expect(order).toHaveLength(3)
    expect(Math.abs(order.indexOf(0) - order.indexOf(1))).toBe(1)
  })

  it('weights sum to one and are all positive', () => {
    const cov = covarianceMatrix([walkReturns(1), walkReturns(2), walkReturns(3), walkReturns(4)])
    const w = hrpWeights(shrinkCovariance(cov))
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    expect(w.every((x) => x > 0)).toBe(true)
  })

  it('gives the quiet name more weight than the loud one', () => {
    const calm = walk(3, 400, 0.004)
    const wild = walk(9, 400, 0.05)
    const toReturns = (c: number[]) => c.slice(1).map((x, i) => x / (c[i] as number) - 1)
    const cov = shrinkCovariance(covarianceMatrix([toReturns(calm), toReturns(wild)]))
    const w = hrpWeights(cov)
    expect(w[0] as number).toBeGreaterThan(w[1] as number)
  })

  it('puts everything in the only holding there is', () => {
    expect(hrpWeights([[0.04]])).toEqual([1])
    expect(hrpWeights([])).toEqual([])
  })
})

describe('allocate', () => {
  const series = new Map<string, (number | null)[]>([
    ['AAA', walk(1, 400, 0.01)],
    ['BBB', walk(2, 400, 0.03)],
    ['CCC', walk(3, 400, 0.02)],
    ['DDD', walk(4, 400, 0.015)],
  ])
  const holdings = [
    { id: 'AAA', group: 'Tech' },
    { id: 'BBB', group: 'Tech' },
    { id: 'CCC', group: 'Energy' },
    { id: 'DDD', group: 'Health' },
  ]

  it('equal weight is equal', () => {
    const a = allocate(holdings, series, 'equal')
    expect(a.weights.map((w) => w.weight)).toEqual([0.25, 0.25, 0.25, 0.25])
    expect(a.portfolioVolatility).toBeGreaterThan(0)
  })

  it('inverse-vol gives the calm name the most', () => {
    const a = allocate(holdings, series, 'inverse-vol')
    const byId = new Map(a.weights.map((w) => [w.id, w.weight]))
    expect(byId.get('AAA') as number).toBeGreaterThan(byId.get('BBB') as number)
    expect(a.weights.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 10)
  })

  it('hrp weights sum to one and every risk contribution is reported', () => {
    const a = allocate(holdings, series, 'hrp')
    expect(a.weights.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 10)
    expect(a.weights.every((w) => Number.isFinite(w.riskContribution))).toBe(true)
    expect(a.days).toBeGreaterThan(300)
  })

  it('respects a single-name cap', () => {
    const a = allocate(holdings, series, 'inverse-vol', { perHolding: 0.3 })
    expect(Math.max(...a.weights.map((w) => w.weight))).toBeLessThanOrEqual(0.3 + 1e-9)
    expect(a.warnings).toHaveLength(0)
  })

  it('respects a sector cap and keeps the single-name cap after redistributing', () => {
    const a = allocate(holdings, series, 'equal', { perHolding: 0.4, perGroup: 0.4 })
    const byGroup = new Map<string, number>()
    for (const w of a.weights) {
      const g = holdings.find((h) => h.id === w.id)?.group as string
      byGroup.set(g, (byGroup.get(g) ?? 0) + w.weight)
    }
    expect(Math.max(...byGroup.values())).toBeLessThanOrEqual(0.4 + 1e-6)
    expect(Math.max(...a.weights.map((w) => w.weight))).toBeLessThanOrEqual(0.4 + 1e-6)
  })

  it('says so when a cap is arithmetically impossible', () => {
    const a = allocate(holdings, series, 'equal', { perHolding: 0.2 })
    expect(a.warnings.join(' ')).toContain('cannot be met')
    // and still returns a usable, normalised allocation rather than nothing
    expect(a.weights.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 10)
  })

  it('excludes a name with no price history and names it', () => {
    const a = allocate([...holdings, { id: 'ZZZ', group: 'Tech' }], series, 'equal')
    expect(a.excluded.map((e) => e.id)).toContain('ZZZ')
    expect(a.weights).toHaveLength(4)
  })

  it('refuses to estimate risk from too few overlapping days', () => {
    const short = new Map<string, (number | null)[]>([
      ['AAA', walk(1, 40, 0.01)],
      ['BBB', walk(2, 40, 0.01)],
    ])
    const a = allocate(holdings.slice(0, 2), short, 'hrp')
    expect(a.weights).toHaveLength(0)
    expect(a.warnings.join(' ')).toContain('overlapping trading days')
  })
})
