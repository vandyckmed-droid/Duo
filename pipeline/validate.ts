import { SIGNAL_IDS } from '../src/calc/signals.ts'
import type { Manifest, SecurityRecord } from '../src/domain/dataset.ts'
import { SEGMENT_IDS, type Segment } from '../src/domain/segments.ts'

/**
 * The gate between computing a dataset and publishing it.
 *
 * Every check here exists because the failure it catches would otherwise ship
 * silently: a half-resolved index looks like a complete ranking, a NaN signal
 * sorts arbitrarily, a stale as-of date serves last month as though it were
 * today. If validation errors, nothing is published and the dataset already
 * being served — the last one that passed — keeps serving.
 */

export interface Issue {
  readonly level: 'error' | 'warning'
  readonly message: string
}

/** Below these per-segment counts the universe is materially incomplete. */
const SEGMENT_FLOOR: Record<Segment, number> = { '500': 400, '400': 300, '600': 450 }

export interface ValidateOptions {
  readonly minimumSecurities: number
  /** The run date; injectable so tests are not wired to the wall clock. */
  readonly today?: string
}

export function validate(
  securities: readonly SecurityRecord[],
  manifest: Manifest,
  options: ValidateOptions,
): Issue[] {
  const issues: Issue[] = []
  const error = (message: string) => issues.push({ level: 'error', message })
  const warning = (message: string) => issues.push({ level: 'warning', message })

  if (securities.length < options.minimumSecurities) {
    error(`only ${securities.length} securities; expected at least ${options.minimumSecurities}`)
  }

  const capped = options.minimumSecurities < 900
  for (const segment of SEGMENT_IDS) {
    const count = securities.filter((s) => s.segment === segment).length
    if (!capped && count < SEGMENT_FLOOR[segment]) {
      error(`segment ${segment}: only ${count} securities; expected at least ${SEGMENT_FLOOR[segment]}`)
    }
  }

  const seen = new Set<string>()
  for (const s of securities) {
    if (seen.has(s.ticker)) error(`${s.ticker}: published twice`)
    seen.add(s.ticker)

    for (const id of SIGNAL_IDS) {
      const value = s.signals[id]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        error(`${s.ticker}: signal ${id} is not a finite number`)
      } else if (Math.abs(value) > 25) {
        // A return/vol ratio this size is a data fault, not a stock.
        error(`${s.ticker}: signal ${id} = ${value.toFixed(1)} is implausible`)
      }
    }

    if (!(s.low52 > 0) || !(s.high52 >= s.low52)) {
      error(`${s.ticker}: broken 52-week range [${s.low52}, ${s.high52}]`)
    } else if (!(s.last >= s.low52 && s.last <= s.high52)) {
      error(`${s.ticker}: last close ${s.last} outside its 52-week range`)
    }
  }

  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const ageDays = (Date.parse(today) - Date.parse(manifest.asOf)) / 86_400_000
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > 7) {
    error(`asOf ${manifest.asOf} is not within a week of ${today}`)
  }

  if (manifest.counts.total !== securities.length) {
    error(`manifest total ${manifest.counts.total} does not match ${securities.length} securities`)
  }
  if (manifest.excluded.length > 120) {
    warning(`${manifest.excluded.length} exclusions — worth reading the reasons`)
  }

  return issues
}

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.level === 'error')
}
