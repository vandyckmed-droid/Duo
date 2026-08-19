/**
 * Ranking.
 *
 * Ranking is separated from the metrics themselves so that adding a metric is
 * adding a number, not adding a ranking. The rules are the same for every
 * metric and stated once here:
 *
 *  - Names without a value are never given one. They rank nowhere and are
 *    reported separately, so an absent metric can never masquerade as a bad
 *    one — a stock with no 12−1 is not the worst momentum name in the list.
 *  - Ties share the competition rank (1, 2, 2, 4), because two identical
 *    values are not two different positions.
 *  - The comparison is a single direction flag per metric. Nothing is
 *    normalised, weighted or blended: rank 1 means the largest (or smallest)
 *    value of that one metric, and that is the whole explanation.
 */

export type Direction = 'desc' | 'asc'

export interface Ranked<T> {
  readonly item: T
  readonly value: number
  readonly rank: number
}

export interface RankResult<T> {
  /** Ranked entries, best first. */
  readonly ranked: readonly Ranked<T>[]
  /** Entries with no value for this metric, in input order. */
  readonly unranked: readonly T[]
  /** Rank by identity, for cheap lookup and rank-change arithmetic. */
  readonly rankOf: ReadonlyMap<string, number>
}

export function rank<T>(
  items: readonly T[],
  identify: (item: T) => string,
  valueOf: (item: T) => number | null | undefined,
  direction: Direction = 'desc',
): RankResult<T> {
  const scored: { item: T; value: number }[] = []
  const unranked: T[] = []

  for (const item of items) {
    const value = valueOf(item)
    if (typeof value === 'number' && Number.isFinite(value)) scored.push({ item, value })
    else unranked.push(item)
  }

  const sign = direction === 'desc' ? -1 : 1
  scored.sort((a, b) => {
    if (a.value !== b.value) return sign * (a.value - b.value)
    // Ticker order as the tiebreak so the list is stable across reranks and a
    // reload never reshuffles equal values.
    return identify(a.item) < identify(b.item) ? -1 : 1
  })

  const ranked: Ranked<T>[] = []
  const rankOf = new Map<string, number>()
  let previous: number | null = null
  let currentRank = 0
  scored.forEach((entry, index) => {
    if (previous === null || entry.value !== previous) currentRank = index + 1
    previous = entry.value
    ranked.push({ item: entry.item, value: entry.value, rank: currentRank })
    rankOf.set(identify(entry.item), currentRank)
  })

  return { ranked, unranked, rankOf }
}

/**
 * Change in rank between two rankings of the same universe.
 *
 * Reported as **positions climbed**: positive means the name moved towards
 * rank 1. Rank numbers fall as a name improves, so the subtraction is
 * `then − now`, and getting that backwards would label every climber a faller.
 *
 * A name absent from either ranking has no change. Treating "unranked
 * previously" as rank 1500 would manufacture a spectacular climb out of a
 * stock that merely accumulated enough history to be measured.
 */
export function rankChange(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const [id, now] of after) {
    const then = before.get(id)
    if (then === undefined) continue
    out.set(id, then - now)
  }
  return out
}
