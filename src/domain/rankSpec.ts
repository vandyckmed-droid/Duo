import type { SecurityRecord } from './dataset.ts'
import type { WindowId } from './windows.ts'

/**
 * The dimensional ranking system.
 *
 * The primary ranking is not a list of named metrics; it is one methodology
 * with three independent dimensions:
 *
 *   window      12M | 6M      — how much history the return covers
 *   skip 1M     on | off      — exclude the most recent 21 trading days
 *   residual    on | off      — subtract β × the segment benchmark
 *   ÷ vol       on | off      — divide by the same window's own volatility
 *
 * Every combination is a real, one-sentence calculation: 12M+skip is 12−1
 * momentum, +residual is residual momentum, +÷vol is the Blitz–Huij–Martens
 * construction. The interface exposes the dimensions; this module owns the
 * mapping from a combination to its published numbers, its name, and its
 * definition — one implementation for all sixteen, so there is nothing to
 * drift apart.
 *
 * When residual and ÷vol are both on, the volatility is the volatility of
 * the residuals themselves — the numerator's own noise, never the raw
 * series' noise under a residual numerator.
 */

export interface RankSpec {
  readonly window: '12M' | '6M'
  readonly skip: boolean
  readonly residual: boolean
  readonly divVol: boolean
}

export const DEFAULT_RANK_SPEC: RankSpec = {
  window: '12M',
  skip: true,
  residual: false,
  divVol: false,
}

/** The published window a spec's numbers live under. */
export function windowIdOf(spec: RankSpec): WindowId {
  if (spec.window === '12M') return spec.skip ? '12-1' : '12M'
  return spec.skip ? '6-1' : '6M'
}

/**
 * The metric id for a spec. Raw specs keep V1's ids — `12-1` has meant the
 * same ranking since the first release, and persisted selections keep
 * resolving. Residual adds `res-`, ÷vol adds `-v`.
 */
export function rankMetricId(spec: RankSpec): string {
  const base = windowIdOf(spec)
  return `${spec.residual ? 'res-' : ''}${base}${spec.divVol ? '-v' : ''}`
}

/** The spec for a metric id, or null when the id is not a rank metric. */
export function parseRankMetricId(id: string): RankSpec | null {
  let rest = id
  const residual = rest.startsWith('res-')
  if (residual) rest = rest.slice(4)
  const divVol = rest.endsWith('-v')
  if (divVol) rest = rest.slice(0, -2)
  const windows: Record<string, { window: '12M' | '6M'; skip: boolean }> = {
    '12M': { window: '12M', skip: false },
    '12-1': { window: '12M', skip: true },
    '6M': { window: '6M', skip: false },
    '6-1': { window: '6M', skip: true },
  }
  const w = windows[rest]
  if (!w) return null
  return { ...w, residual, divVol }
}

/** The human name: "12−1 Return", "Residual 6M / Vol". */
export function rankLabel(spec: RankSpec): string {
  const core = spec.window === '12M' ? (spec.skip ? '12−1' : '12M') : spec.skip ? '6−1' : '6M'
  const name = spec.residual ? `Residual ${core}` : `${core} Return`
  return spec.divVol ? `${name} / Vol` : name
}

/** The compact form for tight spots: "R12−1/V". */
export function rankShort(spec: RankSpec): string {
  const core = spec.window === '12M' ? (spec.skip ? '12−1' : '12M') : spec.skip ? '6−1' : '6M'
  return `${spec.residual ? 'R' : ''}${core}${spec.divVol ? '/V' : ''}`
}

/** The mathematics in words, composed from the active dimensions. */
export function rankDefinition(spec: RankSpec): string {
  const days = spec.window === '12M' ? 252 : 126
  const parts: string[] = []
  parts.push(
    spec.skip
      ? `Total return over the ${days} trading days ending 21 trading days ago — the skipped month keeps short-term reversal out of the signal.`
      : `Total return over the last ${days} trading days.`,
  )
  if (spec.residual) {
    parts.push(
      'The segment benchmark × β is subtracted (β from three years of daily returns, OLS with an intercept); the intercept itself is not subtracted, so persistent outperformance stays visible.',
    )
  }
  if (spec.divVol) {
    parts.push(
      spec.residual
        ? 'Divided by the annualised volatility of the same window’s daily residuals — steady benchmark-stripped strength ranks above the same return earned noisily.'
        : 'Divided by the annualised volatility of the same window’s daily returns.',
    )
  }
  return parts.join(' ')
}

/** The spec's current value from the published facts. Missing stays missing. */
export function rankValue(spec: RankSpec, s: SecurityRecord): number | null {
  const id = windowIdOf(spec)
  const numerator = spec.residual ? (s.residuals[id] ?? null) : (s.returns[id] ?? null)
  if (!spec.divVol) return numerator
  if (numerator === null) return null
  const vol = spec.residual ? (s.rankResidualVol?.[id] ?? null) : (s.rankVol?.[id] ?? null)
  if (vol === null || vol === undefined || vol <= 0) return null
  return numerator / vol
}

/** The same value 63 trading days earlier. ÷vol has no published prior. */
export function rankPrior(spec: RankSpec, s: SecurityRecord): number | null {
  if (spec.divVol) return null
  const id = windowIdOf(spec)
  return spec.residual ? (s.prior.residuals[id] ?? null) : (s.prior.returns[id] ?? null)
}

/** Every combination, 12−1 first so it stays the default ranking. */
export function allRankSpecs(): RankSpec[] {
  const specs: RankSpec[] = []
  for (const window of ['12M', '6M'] as const) {
    for (const skip of [true, false]) {
      for (const residual of [false, true]) {
        for (const divVol of [false, true]) {
          specs.push({ window, skip, residual, divVol })
        }
      }
    }
  }
  return specs
}
