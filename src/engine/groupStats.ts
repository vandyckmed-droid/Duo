import { dailyReturns } from './series.ts'
import { mean, stdev } from './volatility.ts'
import { type Closes, type Result, missing, ok } from './types.ts'

/**
 * Group behaviour.
 *
 * A watchlist is not a portfolio and averaging it is mostly a way of hiding
 * it: twenty names split ten up and ten down average to nothing while
 * describing two completely different groups. So the summary leads with the
 * split and the spread, and reports the average as one fact among several
 * rather than as the answer.
 */
export interface GroupSummary {
  readonly count: number
  /** Names with a value for the metric being summarised. */
  readonly measured: number
  readonly advancers: number
  readonly decliners: number
  readonly unchanged: number
  readonly average: number | null
  readonly median: number | null
  /** Interquartile range — how far apart the group's members actually are. */
  readonly dispersion: number | null
  readonly best: { id: string; value: number } | null
  readonly worst: { id: string; value: number } | null
}

export function summarise(
  entries: readonly { id: string; value: number | null }[],
): GroupSummary {
  const measured = entries.filter(
    (e): e is { id: string; value: number } =>
      typeof e.value === 'number' && Number.isFinite(e.value),
  )
  const values = measured.map((e) => e.value).sort((a, b) => a - b)

  let best: { id: string; value: number } | null = null
  let worst: { id: string; value: number } | null = null
  for (const e of measured) {
    if (!best || e.value > best.value) best = e
    if (!worst || e.value < worst.value) worst = e
  }

  return {
    count: entries.length,
    measured: measured.length,
    advancers: values.filter((v) => v > 0).length,
    decliners: values.filter((v) => v < 0).length,
    unchanged: values.filter((v) => v === 0).length,
    average: values.length ? mean(values) : null,
    median: quantile(values, 0.5),
    dispersion:
      values.length >= 4
        ? (quantile(values, 0.75) as number) - (quantile(values, 0.25) as number)
        : null,
    best,
    worst,
  }
}

/** Linear-interpolated quantile of a pre-sorted array. */
export function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0] as number
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const a = sorted[lo] as number
  const b = sorted[hi] as number
  return a + (b - a) * (pos - lo)
}

/**
 * How concentrated a group is across its sectors, as the Herfindahl index of
 * sector weights: 1 means one sector, 1/n means perfectly spread over n.
 */
export function sectorConcentration(sectors: readonly string[]): {
  herfindahl: number | null
  bySector: { sector: string; count: number; share: number }[]
} {
  if (sectors.length === 0) return { herfindahl: null, bySector: [] }
  const counts = new Map<string, number>()
  for (const s of sectors) counts.set(s, (counts.get(s) ?? 0) + 1)
  const bySector = [...counts]
    .map(([sector, count]) => ({ sector, count, share: count / sectors.length }))
    .sort((a, b) => b.count - a.count || (a.sector < b.sector ? -1 : 1))
  const herfindahl = bySector.reduce((h, s) => h + s.share * s.share, 0)
  return { herfindahl, bySector }
}

/**
 * Daily returns for a set of securities restricted to days on which **every**
 * one of them traded.
 *
 * Synchronisation is not a nicety here. A covariance built from series with
 * different holidays understates the correlation of the pair that share a gap,
 * and a portfolio optimiser fed that matrix will happily over-allocate to the
 * two names it wrongly believes to be diversifying.
 */
export function synchronisedReturns(
  seriesById: ReadonlyMap<string, Closes>,
): { ids: string[]; returns: number[][]; days: number } {
  const ids = [...seriesById.keys()].sort()
  if (ids.length === 0) return { ids, returns: [], days: 0 }

  const perId = ids.map((id) => dailyReturns(seriesById.get(id) as Closes))
  const length = Math.min(...perId.map((r) => r.length))
  const rows: number[][] = ids.map(() => [])

  for (let i = 1; i < length; i++) {
    if (!perId.every((r) => r[i] !== null && r[i] !== undefined)) continue
    perId.forEach((r, k) => (rows[k] as number[]).push(r[i] as number))
  }
  return { ids, returns: rows, days: rows[0]?.length ?? 0 }
}

/** Pearson correlation of two equal-length return vectors. */
export function correlation(a: readonly number[], b: readonly number[]): Result<number> {
  const n = Math.min(a.length, b.length)
  if (n < 2) return missing('insufficient-overlap')
  const sa = stdev(a.slice(0, n))
  const sb = stdev(b.slice(0, n))
  if (!sa.ok) return sa
  if (!sb.ok) return sb
  if (sa.value <= 1e-12 || sb.value <= 1e-12) return missing('degenerate-benchmark')
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  let cov = 0
  for (let i = 0; i < n; i++) cov += ((a[i] as number) - ma) * ((b[i] as number) - mb)
  cov /= n - 1
  return ok(Math.max(-1, Math.min(1, cov / (sa.value * sb.value))))
}

/** Full correlation matrix for synchronised return rows. */
export function correlationMatrix(returns: readonly (readonly number[])[]): number[][] {
  const n = returns.length
  const m: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  for (let i = 0; i < n; i++) {
    ;(m[i] as number[])[i] = 1
    for (let j = i + 1; j < n; j++) {
      const c = correlation(returns[i] as number[], returns[j] as number[])
      const v = c.ok ? c.value : 0
      ;(m[i] as number[])[j] = v
      ;(m[j] as number[])[i] = v
    }
  }
  return m
}

/** Average off-diagonal correlation: one number for "does this group move together?". */
export function averageCorrelation(matrix: readonly (readonly number[])[]): number | null {
  const n = matrix.length
  if (n < 2) return null
  let sum = 0
  let count = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sum += (matrix[i] as readonly number[])[j] as number
      count++
    }
  }
  return count ? sum / count : null
}
