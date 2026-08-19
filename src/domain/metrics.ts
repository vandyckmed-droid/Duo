import type { Direction } from '../engine/ranking.ts'
import type { SecurityRecord } from './dataset.ts'
import { marketCap, percent, percentPlain, ratio, signedInteger, signedRatio } from './format.ts'
import {
  allRankSpecs,
  rankDefinition,
  rankLabel,
  rankMetricId,
  rankPrior,
  rankShort,
  rankValue,
} from './rankSpec.ts'
import { RANK_CHANGE_OFFSET } from './windows.ts'

/**
 * The metric registry.
 *
 * Every ranking variable is one entry in this array. The list control, the
 * ranked rows, the sort, the detail page and the ranking engine all read from
 * here, so a new metric is an entry and nothing else — no new component, no
 * new branch, no card redesign. That is the whole reason the registry exists:
 * momentum is the core signal family and the architecture has to make swapping
 * and adding members of it trivial.
 *
 * Each entry carries its own definition in words. Nothing here is a composite,
 * a z-score blend or a weighted "quality score"; every value is one stated
 * calculation, so "why is A above B?" always has an answer the user can read.
 */

export interface Metric {
  readonly id: string
  /** Full name, used on the detail page and in the metric picker. */
  readonly label: string
  /** Two-to-six characters for the compact control on the ranked list. */
  readonly short: string
  /** The mathematics, in one sentence. Shown, not hidden. */
  readonly definition: string
  /** Which end of the scale ranks first. */
  readonly direction: Direction
  /**
   * The signal family, used by the metric strip to group entries visually.
   * Grouping only — nothing computes across a family.
   */
  readonly family: 'rank' | 'momentum' | 'residual' | 'risk' | 'fundamental' | 'context'
  /**
   * `value` metrics rank by a number on the record. `rank-change` metrics rank
   * by movement between two rankings, which only exists relative to a list.
   */
  readonly kind: 'value' | 'rank-change'
  /** Current value, or null when genuinely unavailable. */
  readonly value: (s: SecurityRecord) => number | null
  /** The same quantity 63 trading days ago, for rank change. */
  readonly prior: (s: SecurityRecord) => number | null
  readonly format: (v: number | null) => string
  /** Rank-change metrics rank movement in this metric's ranking. */
  readonly basedOn?: string
}

/**
 * The primary ranking is the dimensional system in rankSpec.ts: every
 * combination of window, skip, residual and ÷vol is one generated entry, so
 * sixteen rankings share one implementation and cannot drift apart. The
 * standalone statistics below are separate metrics, not dimensions - they
 * are offered outside the primary controls.
 */
const RANK_METRICS: readonly Metric[] = allRankSpecs().map((spec) => ({
  id: rankMetricId(spec),
  family: 'rank' as const,
  label: rankLabel(spec),
  short: rankShort(spec),
  definition: rankDefinition(spec),
  direction: 'desc' as const,
  kind: 'value' as const,
  value: (s: SecurityRecord) => rankValue(spec, s),
  prior: (s: SecurityRecord) => rankPrior(spec, s),
  format: (v: number | null) => (spec.divVol ? signedRatio(v) : percent(v)),
}))

const STANDALONE_METRICS: readonly Metric[] = [
  {
    id: '3M',
    family: 'momentum',
    label: 'Return 3M',
    short: '3M',
    definition: 'Total return over the last 63 trading days.',
    direction: 'desc',
    kind: 'value',
    value: (s) => s.returns['3M'] ?? null,
    prior: (s) => s.prior.returns['3M'] ?? null,
    format: (v) => percent(v),
  },
  {
    id: 'return-vol',
    family: 'risk',
    label: 'Return / vol',
    short: 'R/V',
    definition:
      'Trailing 12-month return divided by 1-year annualised volatility. No risk-free rate is subtracted - this is for comparing two names, not for pricing them.',
    direction: 'desc',
    kind: 'value',
    value: (s) => s.returnPerVol,
    prior: (s) => s.prior.returnPerVol,
    format: (v) => signedRatio(v),
  },
  {
    id: 'volatility',
    family: 'risk',
    label: 'Volatility 1Y',
    short: 'VOL',
    definition:
      'Standard deviation of daily returns over the last 252 trading days, annualised by √252. Ranked low-to-high; it is context, not a penalty applied to anything else.',
    direction: 'asc',
    kind: 'value',
    value: (s) => s.volatility['1Y'] ?? null,
    prior: (s) => s.prior.volatility['1Y'] ?? null,
    format: (v) => percentPlain(v),
  },
  {
    id: 'beta',
    family: 'risk',
    label: 'Beta',
    short: 'β',
    definition:
      'OLS slope of daily returns on the segment benchmark over three years, fitted with an intercept and using only days on which both traded.',
    direction: 'asc',
    kind: 'value',
    value: (s) => s.beta,
    prior: () => null,
    format: (v) => ratio(v),
  },
  {
    id: 'surprise',
    family: 'fundamental',
    label: 'EPS surprise',
    short: 'SUE',
    definition:
      'Latest quarter’s actual EPS minus the consensus estimate at announcement, as a share of the announcement-day price. Only announcements from the last 63 trading days count; names without one are set aside, not ranked last.',
    direction: 'desc',
    kind: 'value',
    value: (s) => s.earnings?.surprise ?? null,
    prior: () => null,
    format: (v) => percent(v, 2),
  },
  {
    id: 'rank-change',
    family: 'context',
    label: `${RANK_CHANGE_OFFSET}d rank change`,
    short: 'Δ RANK',
    definition: `Positions climbed in the 12−1 ranking of this same list over the last ${RANK_CHANGE_OFFSET} trading days. Positive means the name moved towards rank 1. Names that were unrankable then have no change.`,
    direction: 'desc',
    kind: 'rank-change',
    basedOn: '12-1',
    value: (s) => s.returns['12-1'] ?? null,
    prior: (s) => s.prior.returns['12-1'] ?? null,
    format: (v) => signedInteger(v),
  },
  {
    id: 'market-cap',
    family: 'context',
    label: 'Market cap',
    short: 'CAP',
    definition: 'Shares outstanding × last price, as reported by the provider on the refresh date.',
    direction: 'desc',
    kind: 'value',
    value: (s) => s.marketCap,
    prior: (s) => s.prior.marketCap,
    format: (v) => marketCap(v),
  },
]

export const METRICS: readonly Metric[] = [...RANK_METRICS, ...STANDALONE_METRICS]

const BY_ID = new Map(METRICS.map((m) => [m.id, m]))

export const DEFAULT_METRIC_ID = '12-1'

export function metric(id: string): Metric {
  return BY_ID.get(id) ?? (BY_ID.get(DEFAULT_METRIC_ID) as Metric)
}

export function isMetricId(id: string): boolean {
  return BY_ID.has(id)
}
