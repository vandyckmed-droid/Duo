import { resolve } from 'node:path'
import { DIVERSIFICATION, selectDiversified } from '../src/calc/diversify.ts'
import { BLENDED_MOMENTUM, rankUniverse } from '../src/calc/ranking.ts'
import { residualReturns } from '../src/calc/residual.ts'
import { SIGNAL_WINDOWS } from '../src/calc/signals.ts'
import { lastValidIndex, observationCount } from '../src/calc/series.ts'
import { DATASET_VERSION, type Manifest } from '../src/domain/dataset.ts'
import { CALENDAR_TICKER, SEGMENTS, type Segment } from '../src/domain/segments.ts'
import { PriceCache, refresh } from './cache.ts'
import { HISTORY_TRADING_DAYS, alignToCalendar, computeUniverse } from './compute.ts'
import { Fmp, type PricePoint, readApiKey } from './fmp.ts'
import {
  type Exclusion,
  type Member,
  resolveMembership,
  resolveSegmentConflicts,
  resolveShareClasses,
} from './membership.ts'
import { publish } from './publish.ts'
import { hasErrors, validate, validateDiversified } from './validate.ts'

/**
 * The refresh.
 *
 *   membership → price cache → signals → validation → publish
 *
 * Run by GitHub Actions on a schedule and on demand. The API key comes from
 * the environment and stays in this process; what leaves is two static JSON
 * files with no credential anywhere in them.
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
  // after-hours run is harmless; publishing an intraday print labelled
  // "close" is not.
  const to = shiftDays(today(), -1)
  const coldStart = shiftDays(to, -HISTORY_CALENDAR_DAYS)
  const retainFrom = shiftDays(to, -HISTORY_CALENDAR_DAYS - 30)

  log('Resolving segment membership…')
  const membership = await resolveMembership(fmp, log)

  log('Fetching quotes for share-class resolution…')
  const quotes = await fmp.quotes([...new Set(membership.members.map((m) => m.ticker))])
  const marketCapOf = (ticker: string) => quotes.get(ticker)?.marketCap ?? null

  // First pass: one segment per ticker. Share classes are left in for now —
  // deciding between them needs the price history that has not been fetched
  // yet, and fetching both costs a handful of requests.
  const conflicts = resolveSegmentConflicts(membership.members)
  log(`  ${conflicts.members.length} candidates, ${conflicts.excluded.length} segment conflicts`)

  const candidates = limit > 0 ? capPerSegment(conflicts.members, limit) : conflicts.members
  if (candidates.length !== conflicts.members.length) {
    log(`  capped to ${candidates.length} (DUO_MAX_PER_SEGMENT=${limit})`)
  }

  log(`Refreshing prices (${coldStart} → ${to})…`)
  const cache = new PriceCache(CACHE_DIR)
  const tickers = [...candidates.map((m) => m.ticker), CALENDAR_TICKER]
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
  const anchorSeries = await cache.read(CALENDAR_TICKER)
  const anchorPoints = anchorSeries?.points ?? []
  // Without the calendar anchor nothing can be aligned; that is a failed run,
  // not a degraded one.
  if (anchorPoints.length < HISTORY_TRADING_DAYS * 0.9) {
    throw new Error(`${CALENDAR_TICKER}: only ${anchorPoints.length} closes cached`)
  }

  const securityPoints = new Map<string, PricePoint[]>()
  for (const member of candidates) {
    const series = await cache.read(member.ticker)
    if (series && series.points.length > 0) securityPoints.set(member.ticker, series.points)
  }
  // The anchor rides along so its aligned closes exist for beta and residuals.
  securityPoints.set(CALENDAR_TICKER, anchorPoints)

  const aligned = alignToCalendar(anchorPoints, securityPoints)
  log(
    `  calendar: ${aligned.calendar.length} trading days, ${aligned.calendar[0]} → ${aligned.calendar.at(-1)}`,
  )

  // Second pass, now that there is evidence: pick the share class that is
  // actually trading, and drop what has stopped.
  const anchor = aligned.calendar.length - 1
  const evidenceOf = (ticker: string) => {
    const closes = aligned.closes.get(ticker) ?? []
    const last = lastValidIndex(closes)
    return {
      staleness: last < 0 ? Number.POSITIVE_INFINITY : anchor - last,
      observations: observationCount(closes),
      marketCap: marketCapOf(ticker),
    }
  }
  const { eligible: universe, excluded: ineligible } = resolveShareClasses(candidates, evidenceOf)
  const excluded: Exclusion[] = [...conflicts.excluded, ...ineligible]
  log(`  ${universe.length} eligible, ${ineligible.length} dropped after seeing their prices`)
  for (const e of ineligible.slice(0, 8)) log(`    ${e.ticker}: ${e.reason}`)

  log('Computing signals…')
  const computed = computeUniverse(universe, aligned)
  log(`  ${computed.securities.length} securities, ${computed.excluded.length} without usable history`)

  log('Selecting the Diversified 50…')
  const marketCloses = aligned.closes.get(CALENDAR_TICKER) ?? []
  const ranked = rankUniverse(computed.securities, BLENDED_MOMENTUM)
  const residuals = new Map(
    ranked.map((r) => [
      r.security.ticker,
      residualReturns(
        aligned.closes.get(r.security.ticker) ?? [],
        marketCloses,
        DIVERSIFICATION.correlationWindow,
      ),
    ]),
  )
  const diversified = {
    config: {
      correlationWindow: DIVERSIFICATION.correlationWindow,
      similarityNeighbors: DIVERSIFICATION.similarityNeighbors,
      lambda: DIVERSIFICATION.lambda,
      listSize: DIVERSIFICATION.listSize,
    },
    picks: selectDiversified(
      ranked.map((r) => ({ ticker: r.security.ticker, score: r.score })),
      residuals,
      DIVERSIFICATION,
    ),
  }
  const displaced = diversified.picks.filter((p, i) => p.rawRank !== i + 1).length
  log(`  ${diversified.picks.length} picks (λ=${DIVERSIFICATION.lambda}); ${displaced} sit away from their raw rank`)

  const counts: Partial<Record<Segment, number>> = {}
  for (const segment of SEGMENTS) {
    counts[segment.id] = computed.securities.filter((s) => s.segment === segment.id).length
  }

  const manifest: Manifest = {
    version: DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    asOf: aligned.calendar.at(-1) as string,
    provider: 'financialmodelingprep.com/stable',
    counts: { total: computed.securities.length, ...counts },
    calendarDays: aligned.calendar.length,
    windows: SIGNAL_WINDOWS,
    membership: membership.provenance,
    excluded: [...excluded, ...computed.excluded],
  }

  log('Validating…')
  const issues = [
    ...validate(computed.securities, manifest, {
      minimumSecurities: limit > 0 ? Math.min(60, universe.length) : 900,
    }),
    ...validateDiversified(diversified, computed.securities),
  ]
  for (const issue of issues) log(`  [${issue.level}] ${issue.message}`)
  if (hasErrors(issues)) {
    // Nothing is written. The dataset already being served is the last one
    // that passed, which is exactly what should keep serving.
    throw new Error(
      `validation failed with ${issues.filter((i) => i.level === 'error').length} error(s); nothing published`,
    )
  }

  const result = await publish(OUTPUT_DIR, manifest, computed.securities, diversified)

  log(`\nPublished ${(result.bytes / 1e6).toFixed(2)} MB to ${result.directory}`)
  log(
    `  ${manifest.counts.total} securities — 500: ${counts['500']}, 400: ${counts['400']}, 600: ${counts['600']}`,
  )
  for (const p of membership.provenance) log(`  segment ${p.segment} membership: ${p.source}`)
  log(`  ${fmp.requestCount} provider requests in ${((Date.now() - started) / 1000).toFixed(0)}s`)
}

/** Keeps the first `limit` names per segment, for quick local runs. */
function capPerSegment(members: readonly Member[], limit: number): Member[] {
  const out: Member[] = []
  for (const segment of SEGMENTS) {
    out.push(...members.filter((m) => m.segment === segment.id).slice(0, limit))
  }
  return out
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
