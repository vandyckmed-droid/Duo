/**
 * Cross-sectional normalisation.
 *
 * A raw signal value means little on its own — a 40% return is spectacular in
 * one year and mid-pack in another. The V2 composites therefore work in
 * percentiles of the current universe: where does this name stand among the
 * names it is actually competing with today?
 *
 * The rules mirror the ranking engine's: names without a value get no
 * percentile (never a default), ties share a value, and nothing here knows
 * what the numbers mean. Percentile normalisation is also the winsorizer —
 * rank space is bounded by construction, so one extreme raw observation can
 * move its own percentile and nobody else's.
 */

export interface Percentiles {
  /** Percentile in [0, 1] by id; 1 is best for the stated direction. */
  readonly byId: ReadonlyMap<string, number>
  /** How many names had a value — percentiles from tiny samples mean little. */
  readonly measured: number
}

/**
 * Percentiles of a value across the universe. `direction: 'desc'` gives the
 * largest value percentile 1; `'asc'` gives the smallest value percentile 1.
 *
 * The percentile of a tied group is the average rank of the group (midrank),
 * so identical values share one percentile and the mean percentile stays 0.5
 * whatever the tie structure.
 */
export function percentiles(
  entries: readonly { id: string; value: number | null }[],
  direction: 'desc' | 'asc' = 'desc',
): Percentiles {
  const measured = entries.filter(
    (e): e is { id: string; value: number } =>
      typeof e.value === 'number' && Number.isFinite(e.value),
  )
  const byId = new Map<string, number>()
  if (measured.length === 0) return { byId, measured: 0 }
  if (measured.length === 1) {
    byId.set((measured[0] as { id: string }).id, 0.5)
    return { byId, measured: 1 }
  }

  const sign = direction === 'desc' ? 1 : -1
  const sorted = measured.toSorted((a, b) => sign * (a.value - b.value))

  // Midrank over ties, scaled to [0, 1] by (rank − 1) / (n − 1).
  const n = sorted.length
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && (sorted[j + 1] as { value: number }).value === (sorted[i] as { value: number }).value) j++
    const midrank = (i + j) / 2
    const p = midrank / (n - 1)
    for (let k = i; k <= j; k++) byId.set((sorted[k] as { id: string }).id, p)
    i = j + 1
  }
  return { byId, measured: n }
}

/**
 * The mean of the percentiles a name achieved across several measures, or
 * null when fewer than `minPresent` of them exist.
 *
 * This is how a signal family with several members condenses to one family
 * score: equal-weighted rank space, no member dominant, missing members
 * dropped rather than imputed.
 */
export function meanPercentile(
  values: readonly (number | null | undefined)[],
  minPresent = 1,
): number | null {
  const present = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  )
  if (present.length < minPresent) return null
  let sum = 0
  for (const v of present) sum += v
  return sum / present.length
}

/**
 * Momentum agreement: across how many of the given horizons does the name
 * rank in the top `band` of the universe?
 *
 * A stock that is top-quintile at 12−1, 6−1 and 3M is a different animal from
 * one whose entire case rests on a single formation window. The count is the
 * simple version of that statement; the mean percentile alongside it is the
 * graded one. Null when none of the horizons could be measured.
 */
export function agreement(
  horizonPercentiles: readonly (number | null | undefined)[],
  band = 0.8,
): { count: number; of: number } | null {
  const present = horizonPercentiles.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  )
  if (present.length === 0) return null
  let count = 0
  for (const p of present) if (p >= band) count++
  return { count, of: present.length }
}

/**
 * Percentile of each group's aggregate, assigned back to the group's members.
 *
 * This is the industry-context machinery: compute a momentum figure per
 * industry (the median of members, robust to one takeover pop), take the
 * percentile of that figure across industries, and hand every member its
 * industry's standing. Groups smaller than `minGroup` get no percentile —
 * an "industry" of two names is a pair, not a context.
 */
export function groupPercentiles(
  entries: readonly { id: string; group: string; value: number | null }[],
  minGroup = 3,
): ReadonlyMap<string, number> {
  const byGroup = new Map<string, number[]>()
  for (const e of entries) {
    if (typeof e.value !== 'number' || !Number.isFinite(e.value)) continue
    const list = byGroup.get(e.group)
    if (list) list.push(e.value)
    else byGroup.set(e.group, [e.value])
  }

  const groupMedians: { id: string; value: number | null }[] = []
  for (const [group, values] of byGroup) {
    if (values.length < minGroup) continue
    const sorted = values.toSorted((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median =
      sorted.length % 2 === 1
        ? (sorted[mid] as number)
        : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    groupMedians.push({ id: group, value: median })
  }

  const groupP = percentiles(groupMedians, 'desc')
  const out = new Map<string, number>()
  for (const e of entries) {
    const p = groupP.byId.get(e.group)
    if (p !== undefined) out.set(e.id, p)
  }
  return out
}
