import type { SecurityRecord, SignalId } from '../domain/dataset.ts'
import { zScores } from './stats.ts'

/**
 * Cross-sectional ranking.
 *
 * A `RankSpec` names the signals and how to weight them; `rankUniverse` turns
 * published raw signal values into normalised, blended, ranked scores. The UI
 * consumes `RankedSecurity[]` and nothing else, so an alternative signal set
 * or weighting scheme is a different spec — never a UI change.
 */

export interface RankComponent {
  readonly signal: SignalId
  readonly weight: number
}

export interface RankSpec {
  readonly id: string
  readonly label: string
  readonly components: readonly RankComponent[]
}

/**
 * V1's one and only ranking: volatility-adjusted blended momentum,
 * half 12−1 and half 6−1, each z-normalised across the universe.
 */
export const BLENDED_MOMENTUM: RankSpec = {
  id: 'blended-momentum',
  label: 'Momentum',
  components: [
    { signal: '12-1', weight: 0.5 },
    { signal: '6-1', weight: 0.5 },
  ],
}

export interface RankedSecurity {
  readonly security: SecurityRecord
  /** Weighted sum of the spec's z-normalised signals. */
  readonly score: number
  /** 1 = highest score in the whole universe. */
  readonly rank: number
}

/**
 * Scores and ranks the universe under a spec, highest score first.
 *
 * Normalisation is computed over exactly the securities that carry every
 * signal the spec asks for; the pipeline publishes only complete records, so
 * in practice that is the whole universe. Ties break by ticker so the order
 * is total and stable across renders.
 */
export function rankUniverse(
  securities: readonly SecurityRecord[],
  spec: RankSpec,
): RankedSecurity[] {
  const complete = securities.filter((s) =>
    spec.components.every((c) => Number.isFinite(s.signals[c.signal])),
  )

  const totalWeight = spec.components.reduce((sum, c) => sum + c.weight, 0)
  if (complete.length === 0 || totalWeight <= 0) return []

  const scores = Array.from({ length: complete.length }, () => 0)
  for (const component of spec.components) {
    const z = zScores(complete.map((s) => s.signals[component.signal] as number))
    for (let i = 0; i < complete.length; i++) {
      scores[i] = (scores[i] as number) + (component.weight / totalWeight) * (z[i] as number)
    }
  }

  return complete
    .map((security, i) => ({ security, score: scores[i] as number }))
    .sort(
      (a, b) => b.score - a.score || (a.security.ticker < b.security.ticker ? -1 : 1),
    )
    .map((entry, i) => ({ ...entry, rank: i + 1 }))
}
