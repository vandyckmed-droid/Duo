import {
  beta as fitBeta,
  distanceFromHigh,
  endpointAt,
  positiveDayShare,
  residualReturn,
  timeNearHigh,
  topDayConcentration,
  valueOrNull,
  windowReturn,
  type Calendar,
  type Closes,
} from '../src/engine/index.ts'
import type { EarningsEvent } from '../pipeline/fmp.ts'
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
  readonly calendar: Calendar
  readonly closes: Closes
  readonly benchmark: Closes
  readonly sector: string
  readonly industry: string
  /** Announcement-dated earnings events, oldest first; absent for names the
   * provider has nothing for. */
  readonly earnings?: readonly EarningsEvent[]
}

export interface BaseSignal {
  readonly id: string
  /** 'desc': larger raw value ranks better. 'asc': smaller ranks better. */
  readonly direction: 'desc' | 'asc'
  readonly value: (security: SecurityContext, anchor: number) => number | null
}

const PATH_LOOKBACK = 252

/** How stale an announcement may be and still carry a drift signal. */
const EARNINGS_MAX_AGE = 63

/** First calendar index at or after an ISO date, or -1 past the end. */
function calendarIndexOf(calendar: Calendar, date: string): number {
  let lo = 0
  let hi = calendar.length - 1
  if (hi < 0 || (calendar[hi] as string) < date) return -1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((calendar[mid] as string) < date) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * The latest announcement that was public knowledge at the anchor and recent
 * enough to still be news. Point-in-time by construction: only events whose
 * announcement date is on or before the anchor's calendar date qualify, and
 * the announcement's own trading day must sit within EARNINGS_MAX_AGE days.
 */
function latestAnnouncement(
  security: SecurityContext,
  anchor: number,
): { event: EarningsEvent; index: number } | null {
  const events = security.earnings
  if (!events || events.length === 0) return null
  const anchorDate = security.calendar[anchor]
  if (anchorDate === undefined) return null
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i] as EarningsEvent
    if (event.date > anchorDate) continue
    const index = calendarIndexOf(security.calendar, event.date)
    if (index < 0 || index > anchor) return null
    if (anchor - index > EARNINGS_MAX_AGE) return null
    return { event, index }
  }
  return null
}

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
  {
    // R-017: latest surprise, scaled by the announcement-day price so a
    // penny-estimate name cannot explode the ratio.
    id: 'eps-surprise',
    direction: 'desc',
    value: (s, anchor) => {
      const latest = latestAnnouncement(s, anchor)
      if (!latest) return null
      const { epsActual, epsEstimated } = latest.event
      if (epsActual === null || epsEstimated === null) return null
      const price = endpointAt(s.closes, latest.index)
      if (!price.ok) return null
      return (epsActual - epsEstimated) / price.value.close
    },
  },
  {
    // R-018: the market's own two-day verdict on the announcement — close
    // before it to close after it, covering both before-open and after-close
    // releases. Requires the day after to have closed, so an announcement on
    // the anchor itself is not yet measurable (no forward reach).
    id: 'earnings-reaction',
    direction: 'desc',
    value: (s, anchor) => {
      const latest = latestAnnouncement(s, anchor)
      if (!latest || latest.index + 1 > anchor || latest.index < 1) return null
      const before = endpointAt(s.closes, latest.index - 1)
      const after = endpointAt(s.closes, latest.index + 1)
      if (!before.ok || !after.ok) return null
      if (after.value.index <= before.value.index) return null
      return after.value.close / before.value.close - 1
    },
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
