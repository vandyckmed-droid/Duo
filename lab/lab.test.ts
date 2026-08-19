import { describe, expect, it } from 'vitest'
import { decileMeans, monotonicity, ranks, spearman, summarise, turnover } from './stats.ts'
import { signalPercentiles, type SecurityContext } from './signals.ts'
import { walkForward } from './walkforward.ts'

describe('ranks and spearman', () => {
  it('ranks with midrank ties', () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4])
  })

  it('spearman is 1 for any monotone relation', () => {
    expect(spearman([1, 2, 3, 4], [10, 100, 1000, 10000])).toBeCloseTo(1, 10)
  })

  it('spearman is −1 for a reversed ordering', () => {
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10)
  })

  it('refuses degenerate inputs', () => {
    expect(spearman([1, 2], [3, 4])).toBeNull()
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull()
  })
})

describe('decileMeans', () => {
  it('buckets by percentile with the best names in bucket 0', () => {
    const pairs = Array.from({ length: 100 }, (_, i) => ({
      percentile: i / 99,
      outcome: i / 99, // outcome equals percentile: bucket 0 must average highest
    }))
    const curve = decileMeans(pairs)
    expect(curve).toHaveLength(10)
    expect(curve[0] as number).toBeGreaterThan(curve[9] as number)
  })

  it('an empty bucket is null, not zero', () => {
    const curve = decileMeans([{ percentile: 1, outcome: 0.5 }])
    expect(curve[0]).toBe(0.5)
    expect(curve[5]).toBeNull()
  })
})

describe('monotonicity', () => {
  it('is 1 for a curve falling from best to worst bucket', () => {
    expect(monotonicity([5, 4, 3, 2, 1])).toBeCloseTo(1, 10)
  })

  it('is negative for an inverted signal', () => {
    expect(monotonicity([1, 2, 3, 4, 5])).toBeCloseTo(-1, 10)
  })
})

describe('turnover', () => {
  it('is the fraction of the new set that is new', () => {
    expect(turnover(new Set(['a', 'b', 'c', 'd']), new Set(['a', 'b', 'x', 'y']))).toBe(0.5)
  })

  it('is 0 for an unchanged set and null for an empty one', () => {
    expect(turnover(new Set(['a']), new Set(['a']))).toBe(0)
    expect(turnover(new Set(['a']), new Set())).toBeNull()
  })
})

describe('summarise', () => {
  it('reports mean, t and positive share', () => {
    const s = summarise([0.1, 0.2, 0.3, 0.4])
    expect(s.mean).toBeCloseTo(0.25, 10)
    expect(s.positiveShare).toBe(1)
    expect(s.tStat).not.toBeNull()
  })
})

/** Deterministic LCG so the synthetic market is identical on every run. */
function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

/**
 * A synthetic market of drifting walks: each name has a constant daily drift,
 * so past return genuinely predicts future return and a momentum signal must
 * find it.
 */
function syntheticUniverse(names: number, days: number, seed = 7): {
  calendar: string[]
  securities: SecurityContext[]
} {
  const random = rng(seed)
  const calendar = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2020, 0, 1))
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
  const benchmark = Array.from({ length: days }, (_, i) => 100 * 1.0002 ** i)

  const securities: SecurityContext[] = []
  for (let n = 0; n < names; n++) {
    const drift = 0.002 * (n / (names - 1)) - 0.0005 // −0.05% … +0.15% daily
    const closes: (number | null)[] = [100]
    for (let i = 1; i < days; i++) {
      const noise = (random() - 0.5) * 0.004
      closes.push((closes[i - 1] as number) * (1 + drift + noise))
    }
    securities.push({
      ticker: `T${String(n).padStart(3, '0')}`,
      closes,
      benchmark,
      sector: `S${n % 3}`,
      industry: `I${n % 8}`,
    })
  }
  return { calendar, securities }
}

describe('signalPercentiles', () => {
  it('never sees past its anchor: future prices cannot change the cross-section', () => {
    const { securities } = syntheticUniverse(24, 500)
    const anchor = 350

    const perturbed = securities.map((s) => ({
      ...s,
      closes: s.closes.map((c, i) => (i > anchor ? (c as number) * 7 : c)),
      benchmark: s.benchmark.map((c, i) => (i > anchor ? (c as number) * 3 : c)),
    }))

    const before = signalPercentiles(securities, anchor)
    const after = signalPercentiles(perturbed, anchor)
    for (const [signal, byTicker] of before) {
      const other = after.get(signal)
      expect(other, signal).toBeDefined()
      for (const [ticker, p] of byTicker) {
        expect(other?.get(ticker), `${signal}/${ticker}`).toBe(p)
      }
    }
  })

  it('ranks the drifting universe by drift under momentum', () => {
    const { securities } = syntheticUniverse(24, 500)
    const p = signalPercentiles(securities, 480)
    const twelveMonth = p.get('12M')
    // The strongest drift is the last name, the weakest the first.
    expect(twelveMonth?.get('T023')).toBeGreaterThan(0.9)
    expect(twelveMonth?.get('T000')).toBeLessThan(0.1)
  })
})

describe('walkForward', () => {
  it('finds the planted persistence: momentum IC is strongly positive', () => {
    const universe = syntheticUniverse(30, 650)
    const report = walkForward(
      { calendar: universe.calendar, securities: universe.securities },
      { step: 21, horizons: [21], minCrossSection: 20 },
    )
    const momentum = report.signals.find((s) => s.signal === '12M')
    const h = momentum?.horizons[0]
    expect(h?.ic.n as number).toBeGreaterThan(5)
    expect(h?.ic.mean as number).toBeGreaterThan(0.5)
    expect(h?.monotonicity as number).toBeGreaterThan(0.8)
    expect(h?.spread as number).toBeGreaterThan(0)
  })

  it('reports nothing rather than something for a signal below the floor', () => {
    const universe = syntheticUniverse(10, 650)
    const report = walkForward(
      { calendar: universe.calendar, securities: universe.securities },
      { step: 21, horizons: [21], minCrossSection: 200 },
    )
    for (const s of report.signals) {
      for (const h of s.horizons) expect(h.ic.n).toBe(0)
    }
  })

  it('flags horizons longer than the rebalance step as overlapping', () => {
    const universe = syntheticUniverse(24, 650)
    const report = walkForward(
      { calendar: universe.calendar, securities: universe.securities },
      { step: 21, horizons: [21, 63], minCrossSection: 20 },
    )
    const alpha = report.signals.find((s) => s.signal === '12-1')
    expect(alpha?.horizons[0]?.overlapping).toBe(false)
    expect(alpha?.horizons[1]?.overlapping).toBe(true)
  })

  it('turnover of a persistent ranking is low', () => {
    const universe = syntheticUniverse(30, 650)
    const report = walkForward(
      { calendar: universe.calendar, securities: universe.securities },
      { step: 21, horizons: [21], minCrossSection: 20 },
    )
    const momentum = report.signals.find((s) => s.signal === '12M')
    // Constant drifts: the top decile barely changes between rebalances.
    expect(momentum?.meanTopDecileTurnover as number).toBeLessThan(0.35)
  })
})
