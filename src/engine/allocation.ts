import { hrpWeights } from './hrp.ts'
import { portfolioVolatility, riskContributions, shrinkCovariance } from './covariance.ts'
import { covarianceMatrix } from './covariance.ts'
import { synchronisedReturns } from './groupStats.ts'
import { TRADING_DAYS_PER_YEAR } from './types.ts'
import type { Closes } from './types.ts'

export type Scheme = 'equal' | 'inverse-vol' | 'hrp'

export interface Holding {
  readonly id: string
  /** Free-form grouping used by the sector cap; usually a GICS sector. */
  readonly group: string
}

export interface Caps {
  /** Maximum weight for any single holding, as a fraction. */
  readonly perHolding?: number
  /** Maximum combined weight for any one group. */
  readonly perGroup?: number
}

export interface Allocation {
  readonly scheme: Scheme
  readonly weights: { id: string; weight: number; volatility: number; riskContribution: number }[]
  /** Names dropped for want of synchronised history, with the reason. */
  readonly excluded: { id: string; reason: string }[]
  readonly portfolioVolatility: number
  /** Herfindahl index of the weights: 1 is everything in one name. */
  readonly concentration: number
  /** Overlapping trading days the estimate is built from. */
  readonly days: number
  /** Caps that could not be met, stated rather than silently approximated. */
  readonly warnings: string[]
}

/** Fewer synchronised days than this and a covariance estimate is not worth having. */
export const MIN_ALLOCATION_DAYS = 120

export function allocate(
  holdings: readonly Holding[],
  seriesById: ReadonlyMap<string, Closes>,
  scheme: Scheme,
  caps: Caps = {},
): Allocation {
  const excluded: { id: string; reason: string }[] = []
  const usable = new Map<string, Closes>()
  for (const h of holdings) {
    const series = seriesById.get(h.id)
    if (!series) excluded.push({ id: h.id, reason: 'no price history' })
    else usable.set(h.id, series)
  }

  const { ids, returns, days } = synchronisedReturns(usable)
  if (ids.length === 0 || days < MIN_ALLOCATION_DAYS) {
    for (const id of ids) excluded.push({ id, reason: `only ${days} overlapping days` })
    return {
      scheme,
      weights: [],
      excluded,
      portfolioVolatility: 0,
      concentration: 0,
      days,
      warnings:
        ids.length === 0
          ? []
          : [
              `Needs ${MIN_ALLOCATION_DAYS} overlapping trading days to estimate risk; these names share ${days}.`,
            ],
    }
  }

  const covariance = shrinkCovariance(covarianceMatrix(returns))
  const volatilities = ids.map((_, i) =>
    Math.sqrt(Math.max(0, (covariance[i] as number[])[i] as number)),
  )

  let raw: number[]
  switch (scheme) {
    case 'equal':
      raw = ids.map(() => 1 / ids.length)
      break
    case 'inverse-vol': {
      const inv = volatilities.map((v) => (v <= 1e-12 ? 0 : 1 / v))
      const total = inv.reduce((a, b) => a + b, 0)
      raw = total <= 1e-18 ? ids.map(() => 1 / ids.length) : inv.map((x) => x / total)
      break
    }
    case 'hrp':
      raw = hrpWeights(covariance)
      break
  }

  const groups = new Map(holdings.map((h) => [h.id, h.group]))
  const capped = applyCaps(
    ids,
    raw,
    ids.map((id) => groups.get(id) ?? 'Unknown'),
    caps,
  )

  const contributions = riskContributions(capped.weights, covariance)
  return {
    scheme,
    weights: ids.map((id, i) => ({
      id,
      weight: capped.weights[i] as number,
      volatility: volatilities[i] as number,
      riskContribution: contributions[i] as number,
    })),
    excluded,
    portfolioVolatility: portfolioVolatility(capped.weights, covariance),
    concentration: capped.weights.reduce((h, w) => h + w * w, 0),
    days,
    warnings: capped.warnings,
  }
}

/**
 * Caps applied by iterative water-filling: clip whatever exceeds a cap, spread
 * the clipped weight over the holdings that still have headroom, repeat.
 *
 * A cap can be arithmetically impossible — four names cannot respect a 20%
 * single-name cap, and neither can six technology names respect a 30% sector
 * cap if they are the whole portfolio. When that happens the allocation is
 * returned as close as the constraint allows together with a warning that says
 * so. Silently returning something that violates the cap, or silently relaxing
 * the cap, would both be worse than saying it out loud.
 */
function applyCaps(
  ids: readonly string[],
  weights: readonly number[],
  groups: readonly string[],
  caps: Caps,
): { weights: number[]; warnings: string[] } {
  const warnings: string[] = []
  let w = [...weights]
  const n = ids.length

  if (caps.perHolding !== undefined) {
    const cap = caps.perHolding
    if (cap * n < 1 - 1e-9) {
      warnings.push(
        `A ${pct(cap)} single-name cap cannot be met with ${n} holdings — the most even split possible is ${pct(1 / n)} each.`,
      )
    } else {
      w = waterfill(w, w.map(() => cap))
    }
  }

  if (caps.perGroup !== undefined) {
    const cap = caps.perGroup
    const distinct = new Set(groups).size
    if (cap * distinct < 1 - 1e-9) {
      warnings.push(
        `A ${pct(cap)} cap per sector cannot be met across ${distinct} sector${distinct === 1 ? '' : 's'} — the most even split possible is ${pct(1 / distinct)} each.`,
      )
    } else {
      for (let pass = 0; pass < 24; pass++) {
        const totals = new Map<string, number>()
        groups.forEach((g, i) => totals.set(g, (totals.get(g) ?? 0) + (w[i] as number)))
        const over = [...totals].filter(([, t]) => t > cap + 1e-9)
        if (over.length === 0) break
        for (const [group, total] of over) {
          const scale = cap / total
          const freed = total - cap
          groups.forEach((g, i) => {
            if (g === group) w[i] = (w[i] as number) * scale
          })
          const headroom = groups
            .map((g, i) => (g === group ? 0 : (w[i] as number)))
            .reduce((a, b) => a + b, 0)
          if (headroom <= 1e-12) break
          groups.forEach((g, i) => {
            if (g !== group) w[i] = (w[i] as number) + (freed * (w[i] as number)) / headroom
          })
        }
      }
      // The per-holding cap can be broken by redistributing group overflow, so
      // it is re-imposed after the sector pass rather than trusted from before.
      if (caps.perHolding !== undefined && caps.perHolding * n >= 1 - 1e-9) {
        w = waterfill(w, w.map(() => caps.perHolding as number))
      }
    }
  }

  const total = w.reduce((a, b) => a + b, 0)
  return {
    weights: total <= 1e-18 ? w.map(() => 1 / n) : w.map((x) => x / total),
    warnings,
  }
}

function waterfill(weights: readonly number[], caps: readonly number[]): number[] {
  let w = [...weights]
  for (let pass = 0; pass < 64; pass++) {
    let overflow = 0
    const free: number[] = []
    w.forEach((x, i) => {
      const cap = caps[i] as number
      if (x > cap + 1e-12) {
        overflow += x - cap
        w[i] = cap
      } else if (x < cap - 1e-12) free.push(i)
    })
    if (overflow <= 1e-12 || free.length === 0) break
    const base = free.reduce((a, i) => a + (w[i] as number), 0)
    for (const i of free) {
      w[i] = (w[i] as number) + (base <= 1e-18 ? overflow / free.length : (overflow * (w[i] as number)) / base)
    }
  }
  return w
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`

/** Annualised volatility of a single synchronised return row. */
export function annualisedVolatilityOf(returns: readonly number[]): number {
  if (returns.length < 2) return 0
  const m = returns.reduce((a, b) => a + b, 0) / returns.length
  const v = returns.reduce((a, b) => a + (b - m) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(v * TRADING_DAYS_PER_YEAR)
}
