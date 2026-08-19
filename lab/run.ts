import { resolve } from 'node:path'
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { Fmp, readApiKey, type PricePoint } from '../pipeline/fmp.ts'
import { PriceCache, refresh } from '../pipeline/cache.ts'
import {
  resolveMembership,
  resolveSegmentConflicts,
  resolveShareClasses,
} from '../pipeline/membership.ts'
import { alignToCalendar } from '../pipeline/compute.ts'
import { lastValidIndex, observationCount } from '../src/engine/index.ts'
import { BENCHMARK_TICKERS, benchmarkFor } from '../src/domain/segments.ts'
import { walkForward, DEFAULT_CONFIG, type LabUniverse } from './walkforward.ts'
import type { SecurityContext } from './signals.ts'

/**
 * The Alpha Lab runner.
 *
 *   membership → deep price history → aligned universe → walk-forward → report
 *
 * Ingestion is V1's own refresh machinery pointed at a second cache directory
 * with a ~10-year floor, so the Lab inherits the 429 gate, the incremental
 * merge and the never-lose-history rule without a line of new fetching code.
 * Production's shallow cache is untouched.
 *
 * The universe is today's members — the survivorship limitation documented in
 * docs/DATA-LIMITATIONS.md. Every number the report prints is a comparison
 * between signals on identical names and dates, which is what that bias
 * mostly cancels out of; nothing here is an investable absolute-return claim.
 *
 *     API_KEY=… npx tsx lab/run.ts
 */

const ROOT = resolve(import.meta.dirname, '..')
const LAB_CACHE_DIR = process.env['LAB_CACHE_DIR'] ?? resolve(ROOT, '.cache/lab-prices')
const OUT_DIR = process.env['LAB_OUT_DIR'] ?? resolve(ROOT, '.lab')

/** Deep-history floor: probed available back to at least 2016. */
const DEEP_FROM = process.env['LAB_FROM'] ?? '2015-06-01'

function log(message: string): void {
  console.log(message)
}

async function main(): Promise<void> {
  const started = Date.now()
  const fmp = new Fmp(readApiKey(process.env), {
    concurrency: Number(process.env['DUO_CONCURRENCY'] ?? '8'),
  })
  const to = shiftDays(today(), -1)
  const maxTickers = Number(process.env['LAB_MAX_TICKERS'] ?? '0')

  log('Resolving segment membership…')
  const membership = await resolveMembership(fmp, log)
  const conflicts = resolveSegmentConflicts(membership.members)
  const candidates =
    maxTickers > 0 ? conflicts.members.slice(0, maxTickers) : conflicts.members
  log(`  ${candidates.length} candidates`)

  log(`Refreshing deep history (${DEEP_FROM} → ${to})…`)
  const cache = new PriceCache(LAB_CACHE_DIR)
  const tickers = [...candidates.map((m) => m.ticker), ...BENCHMARK_TICKERS]
  const outcomes = await refresh(cache, fmp, tickers, {
    from: DEEP_FROM,
    to,
    retainFrom: DEEP_FROM,
    onProgress: (done, total) => {
      if (done % 200 === 0 || done === total) log(`  ${done}/${total}`)
    },
  })
  const failed = [...outcomes.values()].filter((o) => o.error)
  log(`  ${failed.length} tickers kept from cache after a failed request`)

  log('Aligning to the benchmark calendar…')
  const benchmarkPoints = new Map<string, PricePoint[]>()
  for (const ticker of BENCHMARK_TICKERS) {
    const series = await cache.read(ticker)
    if (!series || series.points.length === 0) throw new Error(`benchmark ${ticker}: no history`)
    benchmarkPoints.set(ticker, series.points)
  }
  const securityPoints = new Map<string, PricePoint[]>()
  for (const m of candidates) {
    const series = await cache.read(m.ticker)
    if (series && series.points.length > 0) securityPoints.set(m.ticker, series.points)
  }
  const aligned = alignToCalendar(benchmarkPoints, securityPoints)
  log(`  ${aligned.calendar.length} trading days, ${securityPoints.size} series`)

  const anchor = aligned.calendar.length - 1
  const { eligible } = resolveShareClasses(
    candidates.filter((m) => securityPoints.has(m.ticker)),
    (ticker) => {
      const closes = aligned.closes.get(ticker) ?? []
      const last = lastValidIndex(closes)
      return {
        observations: observationCount(closes),
        staleness: last < 0 ? Number.POSITIVE_INFINITY : anchor - last,
        marketCap: null,
      }
    },
  )
  log(`  ${eligible.length} eligible after share-class resolution`)

  const securities: SecurityContext[] = eligible.map((m) => ({
    ticker: m.ticker,
    closes: aligned.closes.get(m.ticker) ?? [],
    benchmark: aligned.closes.get(benchmarkFor(m.segment)) ?? [],
    sector: m.sector || 'Unknown',
    industry: m.industry || 'Unknown',
  }))
  const universe: LabUniverse = { calendar: aligned.calendar, securities }

  log('Walking forward…')
  const report = walkForward(universe, DEFAULT_CONFIG)
  log(`  ${report.dates.length} rebalance dates, ${report.universeSize} names`)

  await mkdir(OUT_DIR, { recursive: true })
  const path = resolve(OUT_DIR, 'report.json')
  await writeFile(
    path,
    JSON.stringify({ generatedAt: new Date().toISOString(), from: DEEP_FROM, to, ...report }, null, 1),
  )
  log(`Report written to ${path}`)

  const table = renderTable(report)
  console.log(`\n${table}`)
  const summaryPath = process.env['GITHUB_STEP_SUMMARY']
  if (summaryPath) await appendFile(summaryPath, `## Alpha Lab\n\n${table}\n`)

  log(`Done in ${Math.round((Date.now() - started) / 1000)}s`)
}

function renderTable(report: ReturnType<typeof walkForward>): string {
  const pct = (v: number | null, digits = 2) => (v === null ? '—' : `${(v * 100).toFixed(digits)}%`)
  const num = (v: number | null, digits = 3) => (v === null ? '—' : v.toFixed(digits))
  const lines = [
    `| Signal | Horizon | IC | t | IC>0 | Top−Bottom | Mono | Turnover |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- |`,
  ]
  for (const s of report.signals) {
    for (const h of s.horizons) {
      if (h.ic.n === 0) continue
      lines.push(
        `| ${s.signal} | ${h.horizon}d${h.overlapping ? '*' : ''} | ${num(h.ic.mean)} | ${num(h.ic.tStat, 1)} | ${pct(h.ic.positiveShare, 0)} | ${pct(h.spread)} | ${num(h.monotonicity, 2)} | ${pct(s.meanTopDecileTurnover, 0)} |`,
      )
    }
  }
  lines.push('')
  lines.push(
    `*horizon exceeds the ${report.config.step}d rebalance step: overlapping observations, t-stat overstated.`,
  )
  return lines.join('\n')
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

await main()
