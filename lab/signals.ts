import {
  beta as fitBeta,
  distanceFromHigh,
  positiveDayShare,
  residualReturn,
  timeNearHigh,
  topDayConcentration,
  valueOrNull,
  windowReturn,
  type Closes,
} from '../src/engine/index.ts'
import { BETA_LOOKBACK, WINDOWS } from '../src/domain/windows.ts'
import { FAMILY_WEIGHTS, compositeScore } from '../src/domain/alpha.ts'
import { groupPercentiles, meanPercentile, percentiles } from '../src/domain/crossSection.ts'

/**
 * The signal roster under test.
 *
 * Two tiers. **Base signals** are per-security numbers computed from one
 * price series (plus its benchmark) at an anchor — the same engine calls
 * production makes, pointed at a historical date. **Composites** are built
 * from the base signals' cross-sectional percentiles at that same date, using
 * the identical domain code the interface would use, so the Lab evaluates
 * exactly what would ship.
 *
 * Every base signal declares the direction its hypothesis expects, and the
 * registry entry (docs/RESEARCH-REGISTRY.md) states the hypothesis before the
 * run. Adding a signal here without registering it first is how data mining
 * starts.
 */

export interface SecurityContext {
  readonly ticker: string
  readonly closes: Closes
  readonly benchmark: Closes
  readonly sector: string
  readonly industry: string
}

export interface BaseSignal {
  readonly id: string
  /** 'desc': larger raw value ranks better. 'asc': smaller ranks better. */
  readonly direction: 'desc' | 'asc'
  readonly value: (security: SecurityContext, anchor: number) => number | null
}

const PATH_LOOKBACK = 252

export const BASE_SIGNALS: readonly BaseSignal[] = [
  {
    id: '12M',
    direction: 'desc',
    value: (s, anchor) => valueOrNull(windowReturn(s.closes, WINDOWS['12M'], anchor)),
  },
  {
    id: '12-1',
    direction: 'desc',
    value: (s, anchor) => valueOrNull(windowReturn(s.closes, WINDOWS['12-1'], anchor)),
  },
  {
    id: '6-1',
    direction: 'desc',
    value: (s, anchor) => valueOrNull(windowReturn(s.closes, WINDOWS['6-1'], anchor)),
  },
  {
    id: '3M',
    direction: 'desc',
    value: (s, anchor) => valueOrNull(windowReturn(s.closes, WINDOWS['3M'], anchor)),
  },
  {
    id: 'residual-12M',
    direction: 'desc',
    value: (s, anchor) =>
      valueOrNull(
        residualReturn(
          s.closes,
          s.benchmark,
          fitBeta(s.closes, s.benchmark, BETA_LOOKBACK, anchor),
          WINDOWS['12M'],
          anchor,
        ),
      ),
  },
  {
    id: 'pos-day-share',
    direction: 'desc',
    value: (s, anchor) => valueOrNull(positiveDayShare(s.closes, PATH_LOOKBACK, anchor)),
  },
  {
    id: 'top5-concentration',
    direction: 'asc',
    value: (s, anchor) => valueOrNull(topDayConcentration(s.closes, PATH_LOOKBACK, 5, anchor)),
  },
  {
    id: 'close-to-high',
    direction: 'desc',
    value: (s, anchor) => valueOrNull(distanceFromHigh(s.closes, PATH_LOOKBACK, anchor)),
  },
  {
    id: 'time-near-high',
    direction: 'desc',
    value: (s, anchor) => valueOrNull(timeNearHigh(s.closes, PATH_LOOKBACK, 63, 0.05, anchor)),
  },
]

export const COMPOSITE_IDS = ['trend-quality', 'agreement', 'alpha-v2'] as const

/**
 * Every signal's cross-sectional percentile per ticker at one anchor date,
 * base signals first, composites layered on top of them.
 *
 * The result maps signal id → (ticker → percentile in [0, 1], 1 best). This
 * is the entire cross-section the walk-forward needs for one date.
 */
export function signalPercentiles(
  securities: readonly SecurityContext[],
  anchor: number,
): Map<string, ReadonlyMap<string, number>> {
  const out = new Map<string, ReadonlyMap<string, number>>()

  for (const signal of BASE_SIGNALS) {
    const entries = securities.map((s) => ({ id: s.ticker, value: signal.value(s, anchor) }))
    out.set(signal.id, percentiles(entries, signal.direction).byId)
  }

  const p = (id: string, ticker: string) => out.get(id)?.get(ticker) ?? null

  // Industry context from the same 12−1 raw values, grouped by the *current*
  // classification — a documented survivorship-adjacent limitation, since
  // historical GICS assignments are unavailable.
  const twelveOne = new Map(
    securities.map((s) => [
      s.ticker,
      BASE_SIGNALS.find((b) => b.id === '12-1')?.value(s, anchor) ?? null,
    ]),
  )
  const industryP = groupPercentiles(
    securities.map((s) => ({ id: s.ticker, group: s.industry, value: twelveOne.get(s.ticker) ?? null })),
  )
  const sectorP = groupPercentiles(
    securities.map((s) => ({ id: s.ticker, group: s.sector, value: twelveOne.get(s.ticker) ?? null })),
  )

  const trend = new Map<string, number>()
  const agreementScore = new Map<string, number>()
  const alphaRaw = new Map<string, number>()

  for (const s of securities) {
    const t = s.ticker

    const trendScore = meanPercentile(
      [p('pos-day-share', t), p('top5-concentration', t), p('close-to-high', t), p('time-near-high', t)],
      3,
    )
    if (trendScore !== null) trend.set(t, trendScore)

    // Graded agreement: the mean percentile across the four momentum
    // horizons. The integer count is displayed in product; the mean is the
    // rankable research version of the same idea.
    const agree = meanPercentile([p('12-1', t), p('6-1', t), p('3M', t), p('12M', t)], 4)
    if (agree !== null) agreementScore.set(t, agree)

    const price = meanPercentile([p('12-1', t), p('6-1', t), p('3M', t)], 2)
    const industryPart = industryP.get(t) ?? null
    const sectorPart = sectorP.get(t) ?? null
    const industry =
      industryPart === null && sectorPart === null
        ? null
        : industryPart === null
          ? sectorPart
          : sectorPart === null
            ? industryPart
            : (2 * industryPart + sectorPart) / 3

    const composite = compositeScore({
      price,
      residual: p('residual-12M', t),
      fundamental: null,
      trend: trendScore,
      quality: null,
      industry,
    })
    if (composite !== null) alphaRaw.set(t, composite)
  }

  // Composite raw scores re-percentiled so every signal lives on the same
  // scale for IC and decile bucketing.
  const asEntries = (m: Map<string, number>) =>
    securities.map((s) => ({ id: s.ticker, value: m.get(s.ticker) ?? null }))
  out.set('trend-quality', percentiles(asEntries(trend)).byId)
  out.set('agreement', percentiles(asEntries(agreementScore)).byId)
  out.set('alpha-v2', percentiles(asEntries(alphaRaw)).byId)

  return out
}

export const ALL_SIGNAL_IDS: readonly string[] = [
  ...BASE_SIGNALS.map((s) => s.id),
  ...COMPOSITE_IDS,
]

/** Re-exported so the report can print the priors it evaluated under. */
export { FAMILY_WEIGHTS }
