import type { Manifest, SecurityRecord } from '../src/domain/dataset.ts'
import { benchmarkFor, SEGMENT_IDS, type Segment } from '../src/domain/segments.ts'

/**
 * The gate between a computed dataset and a published one.
 *
 * The published dataset is what the site serves until the next successful run,
 * so publishing something wrong is worse than publishing nothing: the previous
 * run's data was at least correct. These checks fail the run rather than
 * degrade it.
 *
 * They are deliberately about *structure and provenance*, not about whether a
 * number looks plausible. A momentum score of −80% is not an error, and a gate
 * that rejected it would be quietly censoring the market.
 */

export interface ValidationIssue {
  readonly level: 'error' | 'warning'
  readonly message: string
}

export interface ValidationOptions {
  /** Minimum securities for a dataset to be worth publishing. */
  readonly minimumSecurities?: number
  /** Minimum share of names that must have the headline metric. */
  readonly minimumCoverage?: number
}

export function validate(
  securities: readonly SecurityRecord[],
  manifest: Manifest,
  options: ValidationOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const error = (message: string) => issues.push({ level: 'error', message })
  const warn = (message: string) => issues.push({ level: 'warning', message })

  const minimum = options.minimumSecurities ?? 900
  if (securities.length < minimum) {
    error(`only ${securities.length} securities computed, expected at least ${minimum}`)
  }

  const seen = new Set<string>()
  for (const s of securities) {
    if (seen.has(s.ticker)) error(`${s.ticker}: appears more than once`)
    seen.add(s.ticker)

    // The check this whole file exists for. A 400 name carrying SPY as its
    // benchmark means every beta and residual on that row is measuring the
    // wrong thing while looking entirely normal.
    const expected = benchmarkFor(s.segment)
    if (s.benchmark !== expected) {
      error(`${s.ticker}: segment ${s.segment} must use ${expected}, found ${s.benchmark}`)
    }

    if (!SEGMENT_IDS.includes(s.segment)) error(`${s.ticker}: unknown segment ${s.segment}`)
    if (s.last !== null && !(s.last > 0)) error(`${s.ticker}: non-positive last close`)
    if (s.low52 !== null && s.high52 !== null && s.low52 > s.high52) {
      error(`${s.ticker}: 52-week low above its high`)
    }
    for (const [id, value] of Object.entries(s.returns)) {
      if (value !== null && !Number.isFinite(value)) error(`${s.ticker}: ${id} return is not finite`)
    }
    for (const [id, value] of Object.entries(s.volatility)) {
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        error(`${s.ticker}: ${id} volatility is not a non-negative number`)
      }
    }
  }

  for (const segment of SEGMENT_IDS) {
    const inSegment = securities.filter((s) => s.segment === segment)
    if (inSegment.length === 0) {
      error(`segment ${segment} has no securities`)
      continue
    }
    const wrong = inSegment.filter((s) => s.benchmark !== benchmarkFor(segment))
    if (wrong.length > 0) {
      error(`segment ${segment}: ${wrong.length} securities on the wrong benchmark`)
    }
  }

  const coverage = share(securities, (s) => s.returns['12-1'] !== null && s.returns['12-1'] !== undefined)
  const floor = options.minimumCoverage ?? 0.75
  if (coverage < floor) {
    error(`only ${(coverage * 100).toFixed(1)}% of securities have a 12−1 value, expected ${(floor * 100).toFixed(0)}%`)
  }

  const betaCoverage = share(securities, (s) => s.beta !== null)
  if (betaCoverage < 0.6) warn(`only ${(betaCoverage * 100).toFixed(1)}% of securities have a beta`)

  const stale = securities.filter((s) => s.stale).length
  if (stale > securities.length * 0.1) {
    warn(`${stale} securities returned nothing new this run and were kept from cache`)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.asOf)) error(`manifest asOf is not a date: ${manifest.asOf}`)
  if (manifest.calendarDays < 300) {
    error(`calendar holds only ${manifest.calendarDays} trading days`)
  }
  for (const segment of SEGMENT_IDS) {
    if (!manifest.membership.some((m) => m.segment === segment)) {
      error(`manifest records no membership source for segment ${segment}`)
    }
    if (manifest.benchmarks[segment as Segment] !== benchmarkFor(segment)) {
      error(`manifest benchmark for ${segment} is wrong`)
    }
  }

  return issues
}

function share(items: readonly SecurityRecord[], predicate: (s: SecurityRecord) => boolean): number {
  if (items.length === 0) return 0
  return items.filter(predicate).length / items.length
}

export const hasErrors = (issues: readonly ValidationIssue[]) =>
  issues.some((i) => i.level === 'error')
