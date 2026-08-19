/**
 * The Lab's statistics: rank correlation, decile curves, turnover.
 *
 * Everything here is deliberately elementary. The Lab's credibility rests on
 * numbers whose definitions fit in a sentence, because a research harness
 * nobody can audit is how look-ahead and leakage hide.
 */

/** Midranks of a vector, ties averaged — the input to Spearman. */
export function ranks(values: readonly number[]): number[] {
  const order = values
    .map((value, index) => ({ value, index }))
    .toSorted((a, b) => a.value - b.value)
  const out = Array.from({ length: values.length }, () => 0)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && (order[j + 1] as { value: number }).value === (order[i] as { value: number }).value) j++
    const midrank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[(order[k] as { index: number }).index] = midrank
    i = j + 1
  }
  return out
}

function pearson(a: readonly number[], b: readonly number[]): number | null {
  const n = a.length
  if (n < 3 || n !== b.length) return null
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i] as number
    mb += b[i] as number
  }
  ma /= n
  mb /= n
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < n; i++) {
    const da = (a[i] as number) - ma
    const db = (b[i] as number) - mb
    sab += da * db
    saa += da * da
    sbb += db * db
  }
  if (saa === 0 || sbb === 0) return null
  return sab / Math.sqrt(saa * sbb)
}

/**
 * Spearman rank correlation of paired observations; null with fewer than
 * three pairs or a degenerate side. This is the information coefficient when
 * one side is a signal and the other a forward return.
 */
export function spearman(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length) return null
  return pearson(ranks(a), ranks(b))
}

/**
 * Decile means of `outcome`, bucketed by `score` percentile — bucket 0 holds
 * the best-scored names. Buckets with nothing in them are null rather than 0.
 */
export function decileMeans(
  pairs: readonly { percentile: number; outcome: number }[],
  buckets = 10,
): (number | null)[] {
  const sums = Array.from({ length: buckets }, () => 0)
  const counts = Array.from({ length: buckets }, () => 0)
  for (const { percentile, outcome } of pairs) {
    const bucket = Math.min(buckets - 1, Math.floor((1 - percentile) * buckets))
    sums[bucket] = (sums[bucket] as number) + outcome
    counts[bucket] = (counts[bucket] as number) + 1
  }
  return sums.map((sum, i) => ((counts[i] as number) > 0 ? sum / (counts[i] as number) : null))
}

/**
 * Monotonicity of a decile curve in [−1, 1]: 1 means returns fall strictly
 * from the best bucket to the worst, the signature of a signal whose whole
 * ordering carries information rather than only its extremes.
 */
export function monotonicity(curve: readonly (number | null)[]): number | null {
  const present: { index: number; value: number }[] = []
  curve.forEach((value, index) => {
    if (value !== null) present.push({ index, value })
  })
  if (present.length < 3) return null
  const s = spearman(
    present.map((p) => p.index),
    present.map((p) => p.value),
  )
  return s === null ? null : -s
}

/**
 * One-period membership turnover between two sets: the fraction of the new
 * set that was not in the old one. 0 is a portfolio asleep; 1 is a portfolio
 * replaced.
 */
export function turnover(previous: ReadonlySet<string>, current: ReadonlySet<string>): number | null {
  if (current.size === 0) return null
  let fresh = 0
  for (const id of current) if (!previous.has(id)) fresh++
  return fresh / current.size
}

export interface Summary {
  readonly n: number
  readonly mean: number | null
  readonly tStat: number | null
  readonly positiveShare: number | null
}

/** Mean, a naive t-statistic, and the share of positive observations. */
export function summarise(values: readonly number[]): Summary {
  const n = values.length
  if (n === 0) return { n, mean: null, tStat: null, positiveShare: null }
  let sum = 0
  for (const v of values) sum += v
  const mean = sum / n
  if (n < 3) return { n, mean, tStat: null, positiveShare: share(values) }
  let sq = 0
  for (const v of values) sq += (v - mean) ** 2
  const sd = Math.sqrt(sq / (n - 1))
  return {
    n,
    mean,
    tStat: sd === 0 ? null : mean / (sd / Math.sqrt(n)),
    positiveShare: share(values),
  }
}

function share(values: readonly number[]): number {
  let positive = 0
  for (const v of values) if (v > 0) positive++
  return positive / values.length
}
