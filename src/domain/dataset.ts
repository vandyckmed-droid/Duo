import type { Segment } from './segments.ts'

/**
 * The published dataset: the contract between the build pipeline and the app.
 *
 * The app knows this shape and nothing else. It has never heard of Financial
 * Modeling Prep, and swapping the provider changes only the code that produces
 * these files.
 *
 * Two files, both static JSON served next to the app:
 *
 *  - `data/universe.json` — every number the interface needs, in one request.
 *  - `data/manifest.json` — provenance and run metadata, for operations and
 *    the forward prediction record; the app itself never fetches it.
 *
 * The pipeline publishes per-security **signal values** (each window's
 * volatility-adjusted return), not scores or ranks. Cross-sectional
 * normalisation, blending and ranking happen in the app from a `RankSpec`, so
 * a new signal is a new key in `signals` plus a spec entry — never a new
 * dataset format or a UI rewrite.
 */

export const DATASET_VERSION = 4

/**
 * A ranking signal's identity. `'12-1'` and `'6-1'` exist today; the type is
 * open so a future window or a residual-return signal is additive.
 */
export type SignalId = string

export interface SecurityRecord {
  readonly ticker: string
  readonly name: string
  readonly segment: Segment
  readonly sector: string
  /**
   * Volatility-adjusted momentum per window: the window's total return divided
   * by annualised daily volatility over the same formation span. Raw values —
   * cross-sectional normalisation happens in the app. Every published security
   * carries every signal; a name that cannot support one is excluded by the
   * pipeline and listed in the manifest instead.
   */
  readonly signals: Readonly<Record<SignalId, number>>
  /** Latest adjusted close and its date. */
  readonly last: number
  readonly lastDate: string
  /** 52-week range of adjusted closes, consistent with `last`. */
  readonly low52: number
  readonly high52: number
}

export interface UniverseFile {
  readonly version: number
  readonly asOf: string
  readonly securities: readonly SecurityRecord[]
}

/** How one segment's membership was resolved, recorded per run. */
export interface Provenance {
  readonly segment: Segment
  readonly source: string
  readonly detail: string
  readonly count: number
}

export interface Exclusion {
  readonly ticker: string
  readonly reason: string
}

export interface WindowSpec {
  readonly formation: number
  readonly skip: number
}

export interface Manifest {
  readonly version: number
  readonly generatedAt: string
  readonly asOf: string
  readonly provider: string
  readonly counts: { readonly total: number } & Partial<Record<Segment, number>>
  readonly calendarDays: number
  readonly windows: Readonly<Record<SignalId, WindowSpec>>
  readonly membership: readonly Provenance[]
  readonly excluded: readonly Exclusion[]
}
