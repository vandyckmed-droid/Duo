import { resolve } from 'node:path'
import { Fmp, readApiKey, type PricePoint } from './fmp.ts'
import { PriceCache, refresh } from './cache.ts'
import { applyEligibility, resolveMembership, type Member } from './membership.ts'
import { alignToCalendar, computeUniverse, type ComputeInput } from './compute.ts'
import { hasErrors, validate } from './validate.ts'
import { publish } from './publish.ts'
import { DATASET_VERSION, type Manifest } from '../src/domain/dataset.ts'
import { BENCHMARK_TICKERS, SEGMENTS, type Segment } from '../src/domain/segments.ts'
import {
  BETA_LOOKBACK,
  HISTORY_TRADING_DAYS,
  RANK_CHANGE_OFFSET,
  WINDOWS,
} from '../src/domain/windows.ts'

/**
 * The refresh.
 *
 *   membership → price cache → calculation engine → validation → publish
 *
 * Run by GitHub Actions on a schedule and on demand. The API key comes from
 * the environment and stays in this process; what leaves is a directory of
 * static JSON with no credential anywhere in it.
 *
 *     FMP_API_KEY=… npm run refresh
 *
 * Every step is allowed to lose freshness and none is allowed to lose
 * correctness. A ticker the provider will not answer for keeps its cached
 * history; a dataset that fails validation is not published at all, and the
 * previous one — which was correct — keeps serving.
 */

const ROOT = resolve(import.meta.dirname, '..')
const CACHE_DIR = process.env['DUO_CACHE_DIR'] ?? resolve(ROOT, '.cache/prices')
const OUTPUT_DIR = process.env['DUO_OUTPUT_DIR'] ?? resolve(ROOT, 'public/data')

/** Calendar days of history to request, sized from the longest window used. */
const HISTORY_CALENDAR_DAYS = Math.ceil((HISTORY_TRADING_DAYS / 252) * 365) + 45

function log(message: string): void {
  console.log(message)
}

async function main(): Promise<void> {
  const started = Date.now()
  const key = readApiKey(process.env)
  const limit = Number(process.env['DUO_MAX_PER_SEGMENT'] ?? '0')
  const fmp = new Fmp(key, { concurrency: Number(process.env['DUO_CONCURRENCY'] ?? '8') })

  // The run date may be mid-session, so the request ends yesterday: the
  // dataset only ever holds settled closes. Losing one settled close on an
  // after-hours run is harmless; publishing an intraday print labelled "close"
  // is not.
  const to = shiftDays(today(), -1)
  const coldStart = shiftDays(to, -HISTORY_CALENDAR_DAYS)
  const retainFrom = shiftDays(to, -HISTORY_CALENDAR_DAYS - 30)

  log('Resolving segment membership…')
  const membership = await resolveMembership(fmp, log)

  log('Fetching quotes for market cap and eligibility…')
  const quotes = await fmp.quotes([...new Set(membership.members.map((m) => m.ticker))])
  const marketCapOf = (ticker: string) => quotes.get(ticker)?.marketCap ?? null

  const { eligible, excluded } = applyEligibility(membership.members, marketCapOf)
  log(`  ${eligible.length} eligible, ${excluded.length} excluded`)

  const universe = limit > 0 ? capPerSegment(eligible, limit) : eligible
  if (universe.length !== eligible.length) {
    log(`  capped to ${universe.length} (DUO_MAX_PER_SEGMENT=${limit})`)
  }

  log(`Refreshing prices (${coldStart} → ${to})…`)
  const cache = new PriceCache(CACHE_DIR)
  const tickers = [...universe.map((m) => m.ticker), ...BENCHMARK_TICKERS]
  const outcomes = await refresh(cache, fmp, tickers, {
    from: coldStart,
    to,
    retainFrom,
    onProgress: (done, total) => {
      if (done % 200 === 0 || done === total) log(`  ${done}/${total}`)
    },
  })

  const added = [...outcomes.values()].reduce((n, o) => n + Math.max(0, o.added), 0)
  const failed = [...outcomes.values()].filter((o) => o.error)
  log(`  ${added} new observations; ${failed.length} tickers kept from cache after a failed request`)
  for (const f of failed.slice(0, 10)) log(`    ${f.ticker}: ${f.error}`)

  log('Loading cached history…')
  const benchmarkPoints = new Map<string, PricePoint[]>()
  for (const ticker of BENCHMARK_TICKERS) {
    const series = await cache.read(ticker)
    const points = series?.points ?? []
    // Without its benchmark an entire segment loses beta, residual return and
    // any honest comparison; that is a failed run, not a degraded one.
    if (points.length < BETA_LOOKBACK * 0.5) {
      throw new Error(`benchmark ${ticker}: only ${points.length} closes cached`)
    }
    benchmarkPoints.set(ticker, points)
  }

  const securityPoints = new Map<string, PricePoint[]>()
  for (const member of universe) {
    const series = await cache.read(member.ticker)
    if (series && series.points.length > 0) securityPoints.set(member.ticker, series.points)
  }

  const aligned = alignToCalendar(benchmarkPoints, securityPoints)
  log(
    `  calendar: ${aligned.calendar.length} trading days, ${aligned.calendar[0]} → ${aligned.calendar.at(-1)}`,
  )
  if (aligned.orphanedObservations > 0) {
    log(`  ${aligned.orphanedObservations} observations fell outside the benchmark calendar`)
  }

  const benchmarks = new Map(
    BENCHMARK_TICKERS.map((t) => [t, aligned.closes.get(t) ?? []] as const),
  )

  log('Computing analytics…')
  const inputs: ComputeInput[] = universe.map((member) => ({
    member,
    closes: aligned.closes.get(member.ticker) ?? [],
    marketCap: marketCapOf(member.ticker),
    // Historical market cap is not on this subscription. Scaling today's cap by
    // the price move over the window is exact up to share-count changes, which
    // is honest enough for a rank change and never invented out of nothing.
    priorMarketCap: scaleMarketCap(
      marketCapOf(member.ticker),
      aligned.closes.get(member.ticker) ?? [],
    ),
    stale: outcomes.get(member.ticker)?.stale ?? false,
  }))

  const computed = computeUniverse(inputs, { calendar: aligned.calendar, benchmarks })
  log(`  ${computed.securities.length} securities, ${computed.excluded.length} without usable history`)

  const counts: Partial<Record<Segment, number>> = {}
  for (const segment of SEGMENTS) {
    counts[segment.id] = computed.securities.filter((s) => s.segment === segment.id).length
  }

  const manifest: Manifest = {
    version: DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    asOf: aligned.calendar.at(-1) as string,
    provider: 'financialmodelingprep.com/stable',
    benchmarks: Object.fromEntries(SEGMENTS.map((s) => [s.id, s.benchmark])) as Record<
      Segment,
      string
    >,
    membership: membership.provenance,
    counts: { total: computed.securities.length, ...counts },
    calendarDays: aligned.calendar.length,
    windows: Object.fromEntries(Object.entries(WINDOWS).map(([id, w]) => [id, { ...w }])),
    betaLookback: BETA_LOOKBACK,
    rankChangeOffset: RANK_CHANGE_OFFSET,
    excluded: [...excluded, ...computed.excluded],
  }

  log('Validating…')
  const issues = validate(computed.securities, manifest, {
    minimumSecurities: limit > 0 ? Math.min(60, universe.length) : 900,
  })
  for (const issue of issues) log(`  [${issue.level}] ${issue.message}`)
  if (hasErrors(issues)) {
    // Nothing is written. The dataset already on Pages is the last one that
    // passed, which is exactly what should keep serving.
    throw new Error(`validation failed with ${issues.filter((i) => i.level === 'error').length} error(s); nothing published`)
  }

  const result = await publish(OUTPUT_DIR, {
    manifest,
    securities: computed.securities,
    calendar: aligned.calendar,
    closes: aligned.closes,
    benchmarks: [...BENCHMARK_TICKERS],
  })

  log(
    `\nPublished ${result.files} files (${(result.bytes / 1e6).toFixed(1)} MB) to ${result.directory}`,
  )
  log(
    `  ${manifest.counts.total} securities — 500: ${counts['500']}, 400: ${counts['400']}, 600: ${counts['600']}`,
  )
  for (const p of membership.provenance) log(`  segment ${p.segment} membership: ${p.source}`)
  log(`  ${fmp.requestCount} provider requests in ${((Date.now() - started) / 1000).toFixed(0)}s`)
}

/** Keeps the largest `limit` names per segment, for quick local runs. */
function capPerSegment(members: readonly Member[], limit: number): Member[] {
  const out: Member[] = []
  for (const segment of SEGMENTS) {
    out.push(...members.filter((m) => m.segment === segment.id).slice(0, limit))
  }
  return out
}

function scaleMarketCap(current: number | null, closes: readonly (number | null)[]): number | null {
  if (current === null) return null
  const anchor = closes.length - 1
  const thenIndex = anchor - RANK_CHANGE_OFFSET
  if (thenIndex < 0) return null
  const now = lastFinite(closes, anchor)
  const then = lastFinite(closes, thenIndex)
  if (now === null || then === null || now <= 0) return null
  return current * (then / now)
}

function lastFinite(closes: readonly (number | null)[], from: number): number | null {
  for (let i = Math.min(from, closes.length - 1); i >= 0 && i > from - 6; i--) {
    const c = closes[i]
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c
  }
  return null
}

const today = () => new Date().toISOString().slice(0, 10)

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
