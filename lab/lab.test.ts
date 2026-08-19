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

import { crossSectionalDispersion, regimeDefinitions } from './regimes.ts'
import type { Closes } from '../src/engine/index.ts'

/** A market path from piecewise daily rates, starting at 100. */
function path(...segments: { days: number; rate: number }[]): (number | null)[] {
  const out: (number | null)[] = [100]
  for (const { days, rate } of segments) {
    for (let i = 0; i < days; i++) out.push((out[out.length - 1] as number) * (1 + rate))
  }
  return out
}

describe('regimeDefinitions', () => {
  const definitions = (market: Closes, dispersion = new Map<number, number>()) =>
    new Map(regimeDefinitions({ market, dispersionHistory: dispersion }).map((d) => [d.id, d]))

  it('drawdown: adverse only below 90% of the trailing high', () => {
    // 300 flat days, then a fall to 85 over ~11 days.
    const market = path({ days: 300, rate: 0 }, { days: 11, rate: -0.0146 })
    const d = definitions(market).get('drawdown')
    expect(d?.classify(300)).toBe('normal')
    expect(d?.classify(market.length - 1)).toBe('adverse')
  })

  it('trend: adverse when the 126-day market return is negative', () => {
    const d = definitions(path({ days: 300, rate: -0.001 })).get('trend')
    expect(d?.classify(299)).toBe('adverse')
    const u = definitions(path({ days: 300, rate: 0.001 })).get('trend')
    expect(u?.classify(299)).toBe('normal')
  })

  it('volatility: adverse above 20% annualised', () => {
    // Alternating ±2% daily is ~32% annualised; ±0.5% is ~8%.
    const wild = path(...Array.from({ length: 150 }, (_, i) => ({ days: 1, rate: i % 2 ? 0.02 : -0.02 })))
    const calm = path(...Array.from({ length: 150 }, (_, i) => ({ days: 1, rate: i % 2 ? 0.005 : -0.005 })))
    expect(definitions(wild).get('volatility')?.classify(149)).toBe('adverse')
    expect(definitions(calm).get('volatility')?.classify(149)).toBe('normal')
  })

  it('rebound: adverse only when still deep below the high AND rallying hard', () => {
    // Crash of ~30%, then a sharp +8% rebound in a month: the crash signature.
    const rebound = path({ days: 300, rate: 0 }, { days: 30, rate: -0.012 }, { days: 21, rate: 0.004 })
    const d = definitions(rebound).get('rebound')
    expect(d?.classify(rebound.length - 1)).toBe('adverse')
    // The same rally near the high is not the signature.
    const nearHigh = path({ days: 300, rate: 0 }, { days: 21, rate: 0.004 })
    expect(definitions(nearHigh).get('rebound')?.classify(nearHigh.length - 1)).toBe('normal')
  })

  it('dispersion: refuses to classify without enough history, then compares to the expanding median', () => {
    const market = path({ days: 400, rate: 0.0005 })
    const history = new Map<number, number>()
    for (let i = 0; i < 12; i++) history.set(280 + i, 0.1)
    history.set(292, 0.3)
    history.set(293, 0.05)
    // A future entry must not affect an earlier classification.
    history.set(399, 9)
    const d = definitions(market, history).get('dispersion')
    expect(d?.classify(281)).toBeNull() // only 1 earlier date
    expect(d?.classify(292)).toBe('adverse') // 0.3 > median(0.1…)
    expect(d?.classify(293)).toBe('normal') // 0.05 < median
  })
})

describe('crossSectionalDispersion', () => {
  it('is the IQR of the universe 63-day returns', () => {
    // 200 flat names and 200 strong names: IQR spans the gap.
    const closes = new Map<string, Closes>()
    for (let i = 0; i < 200; i++) closes.set(`F${i}`, path({ days: 100, rate: 0 }))
    for (let i = 0; i < 200; i++) closes.set(`S${i}`, path({ days: 100, rate: 0.002 }))
    const d = crossSectionalDispersion(closes, 99)
    expect(d).not.toBeNull()
    expect(d as number).toBeGreaterThan(0.1)
  })

  it('refuses a thin cross-section', () => {
    const closes = new Map<string, Closes>([['A', path({ days: 100, rate: 0 })]])
    expect(crossSectionalDispersion(closes, 99)).toBeNull()
  })
})

describe('walkForward with regimes', () => {
  it('groups per-date ICs by regime state and reports prevalence', () => {
    const { calendar, securities } = syntheticUniverse(30, 650)
    // Market: rises 300 days, then falls — trend flips to adverse partway.
    const market = path({ days: 320, rate: 0.001 }, { days: 329, rate: -0.001 })
    const report = walkForward(
      { calendar, securities, market },
      { step: 21, horizons: [21], minCrossSection: 20 },
    )
    const trend = report.regimes['trend']
    expect(trend).toBeDefined()
    expect((trend?.counts.normal ?? 0) + (trend?.counts.adverse ?? 0)).toBe(report.dates.length)
    expect(trend?.counts.adverse ?? 0).toBeGreaterThan(0)
    const momentum = report.signals.find((s) => s.signal === '12M')?.horizons[0]
    const split = momentum?.byRegime['trend']
    const n = (split?.normal?.n ?? 0) + (split?.adverse?.n ?? 0)
    expect(n).toBe(momentum?.ic.n)
  })

  it('runs without a market series and reports no regimes', () => {
    const { calendar, securities } = syntheticUniverse(24, 650)
    const report = walkForward(
      { calendar, securities },
      { step: 21, horizons: [21], minCrossSection: 20 },
    )
    expect(Object.keys(report.regimes)).toHaveLength(0)
  })
})
