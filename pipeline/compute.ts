import {
  beta as fitBeta,
  distanceFromHigh,
  downsideDeviation,
  isUsable,
  lastValidIndex,
  maxDrawdown,
  observationCount,
  positiveDayShare,
  realisedVolatility,
  residualReturn,
  returnPerVol,
  timeNearHigh,
  topDayConcentration,
  valueOrNull,
  windowReturn,
} from '../src/engine/index.ts'
import type { Closes, Result } from '../src/engine/types.ts'
import type { ByVolatilityWindow, ByWindow, SecurityRecord } from '../src/domain/dataset.ts'
import { benchmarkFor } from '../src/domain/segments.ts'
import {
  BETA_LOOKBACK,
  DRAWDOWN_LOOKBACK,
  RANK_CHANGE_OFFSET,
  VOLATILITY_WINDOWS,
  WINDOWS,
  WINDOW_IDS,
  type VolatilityWindowId,
} from '../src/domain/windows.ts'
import type { PricePoint } from './fmp.ts'
import type { Member } from './membership.ts'

/**
 * Turning cached prices into the published numbers.
 *
 * Two decisions govern this file.
 *
 * **One anchor for everybody.** Every window is measured backwards from the
 * dataset's last trading day, not from each security's own last print. If a
 * name whose feed stopped three weeks ago were measured from its own last
 * close, its "12-month return" would cover a different year than everyone
 * else's and rank against them as though it did not. Endpoint tolerance
 * absorbs a few missing days; beyond that the metric is unavailable, which is
 * the honest answer for a halted name.
 *
 * **The benchmark is chosen by segment, never by convenience.** Each security
 * is regressed against the ETF for its own index. That mapping is applied once,
 * here, from authoritative metadata, and asserted in the tests.
 */

/** Path-quality lookback: the trailing year, matching the 12M window. */
const PATH_LOOKBACK = 252

/** "Near the high" means within 5% of the running 252-day high. */
const NEAR_HIGH_BAND = 0.05

export interface AlignedUniverse {
  readonly calendar: string[]
  readonly closes: Map<string, (number | null)[]>
  /** Provider observations that fell on no known trading day. */
  readonly orphanedObservations: number
}

/**
 * Builds the shared trading calendar from the benchmark series and aligns
 * every security onto it.
 *
 * The benchmarks define the calendar rather than the union of all 1,500
 * securities: a broad-market ETF trades every session, so its dates *are* the
 * US equity calendar, whereas the union would inherit any bad date a single
 * mis-tagged constituent contributed and shift every offset by one.
 */
export function alignToCalendar(
  benchmarks: ReadonlyMap<string, readonly PricePoint[]>,
  securities: ReadonlyMap<string, readonly PricePoint[]>,
): AlignedUniverse {
  const dates = new Set<string>()
  for (const points of benchmarks.values()) for (const p of points) dates.add(p.date)
  const calendar = [...dates].sort()
  const index = new Map(calendar.map((d, i) => [d, i]))

  const closes = new Map<string, (number | null)[]>()
  let orphaned = 0
  const align = (points: readonly PricePoint[]) => {
    const row: (number | null)[] = Array.from({ length: calendar.length }, () => null)
    for (const p of points) {
      const i = index.get(p.date)
      if (i === undefined) orphaned++
      else row[i] = p.close
    }
    return row
  }
  for (const [ticker, points] of benchmarks) closes.set(ticker, align(points))
  for (const [ticker, points] of securities) closes.set(ticker, align(points))

  return { calendar, closes, orphanedObservations: orphaned }
}

export interface ComputeInput {
  readonly member: Member
  readonly closes: Closes
  readonly marketCap: number | null
  readonly priorMarketCap: number | null
  readonly stale: boolean
}

export interface ComputeContext {
  readonly calendar: readonly string[]
  /** Benchmark closes by ETF ticker, already aligned to the calendar. */
  readonly benchmarks: ReadonlyMap<string, Closes>
}

/** Everything published for one security. */
export function computeSecurity(
  input: ComputeInput,
  context: ComputeContext,
): SecurityRecord | null {
  const { member, closes } = input
  const anchor = context.calendar.length - 1
  const priorAnchor = anchor - RANK_CHANGE_OFFSET
  if (anchor < 0) return null

  const benchmarkTicker = benchmarkFor(member.segment)
  const benchmark = context.benchmarks.get(benchmarkTicker)
  if (!benchmark) {
    // Publishing the name without its benchmark would leave beta and residual
    // permanently blank while looking like a data problem with the stock.
    throw new Error(
      `${member.ticker}: benchmark ${benchmarkTicker} for segment ${member.segment} is not in the dataset`,
    )
  }

  const betaFit = fitBeta(closes, benchmark, BETA_LOOKBACK, anchor)
  const priorBetaFit = priorAnchor > 0 ? fitBeta(closes, benchmark, BETA_LOOKBACK, priorAnchor) : betaFit

  const returns: ByWindow = {}
  const residuals: ByWindow = {}
  const priorReturns: ByWindow = {}
  const priorResiduals: ByWindow = {}
  for (const id of WINDOW_IDS) {
    const window = WINDOWS[id]
    returns[id] = valueOrNull(windowReturn(closes, window, anchor))
    residuals[id] = valueOrNull(residualReturn(closes, benchmark, betaFit, window, anchor))
    priorReturns[id] = valueOrNull(windowReturn(closes, window, priorAnchor))
    priorResiduals[id] = valueOrNull(
      residualReturn(closes, benchmark, priorBetaFit, window, priorAnchor),
    )
  }

  const volatility: ByVolatilityWindow = {}
  const priorVolatility: ByVolatilityWindow = {}
  for (const [id, lookback] of Object.entries(VOLATILITY_WINDOWS) as [
    VolatilityWindowId,
    number,
  ][]) {
    volatility[id] = valueOrNull(realisedVolatility(closes, lookback, anchor))
    priorVolatility[id] = valueOrNull(realisedVolatility(closes, lookback, priorAnchor))
  }

  const twelveMonth = windowReturn(closes, WINDOWS['12M'], anchor)
  const yearVol = realisedVolatility(closes, VOLATILITY_WINDOWS['1Y'], anchor)
  const priorTwelveMonth = windowReturn(closes, WINDOWS['12M'], priorAnchor)
  const priorYearVol = realisedVolatility(closes, VOLATILITY_WINDOWS['1Y'], priorAnchor)

  const lastIndex = lastValidIndex(closes)
  const range = fiftyTwoWeekRange(closes, anchor)
  const first = firstDate(closes, context.calendar)

  return {
    ticker: member.ticker,
    name: member.name,
    segment: member.segment,
    benchmark: benchmarkTicker,
    sector: member.sector || 'Unknown',
    industry: member.industry || 'Unknown',
    marketCap: input.marketCap,
    returns,
    residuals,
    volatility,
    returnPerVol: valueOrNull(returnPerVol(twelveMonth, yearVol)),
    maxDrawdown: valueOrNull(maxDrawdown(closes, DRAWDOWN_LOOKBACK, anchor)),
    beta: valueOrNull(mapResult(betaFit, (b) => b.beta)),
    betaR2: valueOrNull(mapResult(betaFit, (b) => b.rSquared)),
    betaObservations: betaFit.ok ? betaFit.value.observations : 0,
    last: lastIndex >= 0 ? (closes[lastIndex] as number) : null,
    lastDate: lastIndex >= 0 ? (context.calendar[lastIndex] as string) : null,
    low52: range.low,
    high52: range.high,
    path: {
      positiveDayShare: valueOrNull(positiveDayShare(closes, PATH_LOOKBACK, anchor)),
      top5Share: valueOrNull(topDayConcentration(closes, PATH_LOOKBACK, 5, anchor)),
      closeToHigh: valueOrNull(distanceFromHigh(closes, PATH_LOOKBACK, anchor)),
      timeNearHigh: valueOrNull(
        timeNearHigh(closes, PATH_LOOKBACK, RANK_CHANGE_OFFSET, NEAR_HIGH_BAND, anchor),
      ),
      downsideDeviation: valueOrNull(downsideDeviation(closes, PATH_LOOKBACK, anchor)),
    },
    history: {
      days: observationCount(closes),
      from: first,
      to: lastIndex >= 0 ? (context.calendar[lastIndex] as string) : null,
    },
    prior: {
      returns: priorReturns,
      residuals: priorResiduals,
      volatility: priorVolatility,
      returnPerVol: valueOrNull(returnPerVol(priorTwelveMonth, priorYearVol)),
      marketCap: input.priorMarketCap,
    },
    ...(input.stale ? { stale: true } : {}),
  }
}

function mapResult<T, R>(r: Result<T>, f: (v: T) => R): Result<R> {
  return r.ok ? { ok: true, value: f(r.value) } : r
}

/** Low and high of adjusted closes over the trailing year. */
function fiftyTwoWeekRange(
  closes: Closes,
  anchor: number,
): { low: number | null; high: number | null } {
  let low: number | null = null
  let high: number | null = null
  for (let i = Math.max(0, anchor - 251); i <= anchor; i++) {
    const c = closes[i]
    if (!isUsable(c)) continue
    if (low === null || c < low) low = c
    if (high === null || c > high) high = c
  }
  return { low, high }
}

function firstDate(closes: Closes, calendar: readonly string[]): string | null {
  for (let i = 0; i < closes.length; i++) {
    if (isUsable(closes[i])) return calendar[i] ?? null
  }
  return null
}

/**
 * Securities to publish, and those held back.
 *
 * A name with no usable price history is excluded outright: it would occupy a
 * row that could never say anything. A name with *some* history is published
 * with whatever metrics its history supports and blanks elsewhere, because
 * "not enough history yet" is a fact worth showing.
 */
export function computeUniverse(
  inputs: readonly ComputeInput[],
  context: ComputeContext,
): { securities: SecurityRecord[]; excluded: { ticker: string; reason: string }[] } {
  const securities: SecurityRecord[] = []
  const excluded: { ticker: string; reason: string }[] = []

  for (const input of inputs) {
    if (observationCount(input.closes) === 0) {
      excluded.push({ ticker: input.member.ticker, reason: 'no usable price history' })
      continue
    }
    const record = computeSecurity(input, context)
    if (record) securities.push(record)
  }

  securities.sort((a, b) => (a.ticker < b.ticker ? -1 : 1))
  return { securities, excluded }
}

export { RANK_CHANGE_OFFSET }
