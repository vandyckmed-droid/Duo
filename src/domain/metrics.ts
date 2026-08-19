import type { Direction } from '../engine/ranking.ts'
import type { SecurityRecord } from './dataset.ts'
import { marketCap, percent, percentPlain, ratio, signedInteger, signedRatio } from './format.ts'
import { RANK_CHANGE_OFFSET, WINDOWS } from './windows.ts'

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

const w = (id: keyof typeof WINDOWS) => WINDOWS[id]

export const METRICS: readonly Metric[] = [
  {
    id: '12-1',
    label: '12−1 momentum',
    short: '12−1',
    definition: `Total return over the ${w('12-1').formation} trading days ending ${w('12-1').skip} trading days ago. The skipped month keeps short-term reversal out of the signal.`,
    direction: 'desc',
    kind: 'value',
    value: (s) => s.returns['12-1'] ?? null,
    prior: (s) => s.prior.returns['12-1'] ?? null,
    format: (v) => percent(v),
  },
  {
    id: '6-1',
    label: '6−1 momentum',
    short: '6−1',
    definition: `Total return over the ${w('6-1').formation} trading days ending ${w('6-1').skip} trading days ago. Half the formation window of 12−1, the same skipped month.`,
    direction: 'desc',
    kind: 'value',
    value: (s) => s.returns['6-1'] ?? null,
    prior: (s) => s.prior.returns['6-1'] ?? null,
    format: (v) => percent(v),
  },
  {
    id: '12M',
    label: 'Return 12M',
    short: '12M',
    definition: `Total return over the last ${w('12M').formation} trading days, with no skipped month.`,
    direction: 'desc',
    kind: 'value',
    value: (s) => s.returns['12M'] ?? null,
    prior: (s) => s.prior.returns['12M'] ?? null,
    format: (v) => percent(v),
  },
  {
    id: '3M',
    label: 'Return 3M',
    short: '3M',
    definition: `Total return over the last ${w('3M').formation} trading days.`,
    direction: 'desc',
    kind: 'value',
    value: (s) => s.returns['3M'] ?? null,
    prior: (s) => s.prior.returns['3M'] ?? null,
    format: (v) => percent(v),
  },
  {
    id: 'return-vol',
    label: 'Return / vol',
    short: 'R/V',
    definition:
      'Trailing 12-month return divided by 1-year annualised volatility. No risk-free rate is subtracted — this is for comparing two names, not for pricing them.',
    direction: 'desc',
    kind: 'value',
    value: (s) => s.returnPerVol,
    prior: (s) => s.prior.returnPerVol,
    format: (v) => signedRatio(v),
  },
  {
    id: 'residual',
    label: 'Residual 12M',
    short: 'RES',
    definition:
      'Twelve-month return minus β × the same window on the segment benchmark (SPY, IJH or IJR). The fitted intercept is not subtracted, so persistent outperformance stays visible instead of being absorbed.',
    direction: 'desc',
    kind: 'value',
    value: (s) => s.residuals['12M'] ?? null,
    prior: (s) => s.prior.residuals['12M'] ?? null,
    format: (v) => percent(v),
  },
  {
    id: 'volatility',
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
    label: 'EPS surprise',
    short: 'SUE',
    definition:
      'Latest quarter’s actual EPS minus the consensus estimate at announcement, as a share of the announcement-day price. Only announcements from the last 63 trading days count; names without one are set aside, not ranked last.',
    direction: 'desc',
    kind: 'value',
    value: (s) => s.earnings?.surprise ?? null,
    // No honest prior exists: the announcement 63 trading days ago is a
    // different quarter, so rank change is not offered for this metric.
    prior: () => null,
    format: (v) => percent(v, 2),
  },
  {
    id: 'rank-change',
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

const BY_ID = new Map(METRICS.map((m) => [m.id, m]))

export const DEFAULT_METRIC_ID = '12-1'

export function metric(id: string): Metric {
  return BY_ID.get(id) ?? (BY_ID.get(DEFAULT_METRIC_ID) as Metric)
}

export function isMetricId(id: string): boolean {
  return BY_ID.has(id)
}
