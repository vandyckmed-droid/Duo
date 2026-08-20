import { correlation } from './stats.ts'

/**
 * The Diversified 50: a correlation-aware selection from the raw ranking.
 *
 * No sector, industry, or index quotas — the return data itself identifies
 * when two stocks represent the same underlying bet. The list is built
 * greedily:
 *
 *     selection score = momentum score − λ × similarity
 *
 * where similarity is the candidate's average correlation (on market-residual
 * daily returns) to the few already-selected stocks it most resembles.
 * Diversification is a penalty, never a rule: a stock that looks like one
 * already chosen can still enter if its momentum is strong enough to pay the
 * toll.
 *
 * Only positive correlation counts as redundancy. A negatively correlated
 * candidate is clamped to zero rather than rewarded — hedging value is not
 * this list's job, and letting it outbid momentum would be a different
 * product.
 */

export interface DiversificationConfig {
  /** Trading days of residual returns the correlations are measured over. */
  readonly correlationWindow: number
  /** How many of the most-correlated selected stocks define similarity. */
  readonly similarityNeighbors: number
  /** λ: the price of redundancy, in momentum-score (z) units. */
  readonly lambda: number
  readonly listSize: number
  /** Fewest shared return days a correlation may be estimated from. */
  readonly minOverlap: number
}

/**
 * The V1.1 defaults. λ is the calibration knob: 0 reproduces the raw Top 50;
 * higher values increasingly favour independent return patterns.
 */
export const DIVERSIFICATION: DiversificationConfig = {
  correlationWindow: 252,
  similarityNeighbors: 3,
  lambda: 1.0,
  listSize: 50,
  minOverlap: 60,
}

export interface RankedCandidate {
  readonly ticker: string
  /** The raw momentum score (the z-blend). Unchanged by diversification. */
  readonly score: number
}

export interface DiversifiedPick {
  readonly ticker: string
  /** Position in the raw ranking, so signal displacement stays visible. */
  readonly rawRank: number
  /** The similarity the pick paid for at selection time, in [0, 1]. */
  readonly similarity: number
}

/**
 * Greedy selection.
 *
 * Each round scores every remaining candidate as `score − λ × similarity`
 * against the stocks already chosen and takes the best; the first pick is
 * therefore always the raw #1. Candidates whose residual series cannot
 * support a correlation contribute no evidence and carry no penalty.
 *
 * `candidates` must arrive in raw-rank order; it is re-sorted defensively
 * with the raw ranking's own tie-break so `rawRank` can never lie.
 */
export function selectDiversified(
  candidates: readonly RankedCandidate[],
  residuals: ReadonlyMap<string, readonly (number | null)[]>,
  config: DiversificationConfig = DIVERSIFICATION,
): DiversifiedPick[] {
  const ranked = [...candidates].sort(
    (a, b) => b.score - a.score || (a.ticker < b.ticker ? -1 : 1),
  )
  const rawRank = new Map(ranked.map((c, i) => [c.ticker, i + 1]))

  interface Live {
    readonly candidate: RankedCandidate
    /** Clamped correlations to selected stocks, unsorted. */
    readonly redundancy: number[]
  }
  let remaining: Live[] = ranked.map((candidate) => ({ candidate, redundancy: [] }))
  const picks: DiversifiedPick[] = []

  const similarityOf = (entry: Live): number => {
    if (entry.redundancy.length === 0) return 0
    const top = [...entry.redundancy]
      .sort((a, b) => b - a)
      .slice(0, config.similarityNeighbors)
    return top.reduce((a, b) => a + b, 0) / top.length
  }

  while (picks.length < config.listSize && remaining.length > 0) {
    let best: Live | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    let bestSimilarity = 0
    for (const entry of remaining) {
      const similarity = similarityOf(entry)
      const selectionScore = entry.candidate.score - config.lambda * similarity
      if (selectionScore > bestScore) {
        best = entry
        bestScore = selectionScore
        bestSimilarity = similarity
      }
    }
    if (!best) break
    const chosen = best
    picks.push({
      ticker: chosen.candidate.ticker,
      rawRank: rawRank.get(chosen.candidate.ticker) as number,
      similarity: bestSimilarity,
    })

    // Fold the new selection into every survivor's redundancy evidence.
    const chosenResiduals = residuals.get(chosen.candidate.ticker)
    remaining = remaining.filter((e) => e !== chosen)
    if (chosenResiduals) {
      for (const entry of remaining) {
        const series = residuals.get(entry.candidate.ticker)
        if (!series) continue
        const rho = correlation(series, chosenResiduals, config.minOverlap)
        if (rho !== null && rho > 0) entry.redundancy.push(rho)
      }
    }
  }

  return picks
}
