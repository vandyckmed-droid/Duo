import { returnBetween, valueOrNull } from '../src/engine/index.ts'
import type { Closes } from '../src/engine/index.ts'
import { decileMeans, monotonicity, spearman, summarise, turnover } from './stats.ts'
import { ALL_SIGNAL_IDS, signalPercentiles, type SecurityContext } from './signals.ts'
import {
  crossSectionalDispersion,
  regimeDefinitions,
  type RegimeState,
} from './regimes.ts'

/**
 * Walk-forward evaluation.
 *
 * Chronological only. At each rebalance date the harness computes every
 * signal's cross-section using prices up to that date — the engine's
 * `evaluatedAt` anchoring guarantees no calculation can see past its anchor —
 * then measures what actually happened next. Nothing is fitted, so there is
 * no train/test split to get wrong; the discipline this file owes is using
 * only same-date signal values against strictly-later returns.
 *
 * What is measured, per signal and horizon:
 *
 *  - **IC**: Spearman correlation between the signal's percentile and the
 *    forward return's percentile across names, per date, then summarised.
 *    Horizons longer than the rebalance step produce overlapping forward
 *    windows; their observations are not independent and the printed t-stat
 *    says so.
 *  - **Decile curve**: mean forward return per signal decile, averaged over
 *    dates; its monotonicity; the top-minus-bottom spread.
 *  - **Top-decile turnover**: how much of the best decile is new at each
 *    step — the cost side of any signal.
 *  - **By-year IC**: the same IC grouped by calendar year, the first regime
 *    cut. A signal that only worked in one year is one year's coincidence.
 */

export interface WalkForwardConfig {
  /** Trading days between rebalance dates. */
  readonly step: number
  /** Forward horizons in trading days. */
  readonly horizons: readonly number[]
  /** Skip dates where fewer names than this had a value for a signal. */
  readonly minCrossSection: number
}

export const DEFAULT_CONFIG: WalkForwardConfig = {
  step: 21,
  horizons: [21, 63, 126],
  minCrossSection: 200,
}

export interface SignalHorizonResult {
  readonly signal: string
  readonly horizon: number
  readonly ic: { n: number; mean: number | null; tStat: number | null; positiveShare: number | null }
  /** True when the horizon exceeds the step, making IC dates overlap. */
  readonly overlapping: boolean
  readonly decileCurve: readonly (number | null)[]
  readonly monotonicity: number | null
  /** Mean top-decile minus bottom-decile forward return per period. */
  readonly spread: number | null
  readonly byYear: Readonly<Record<string, { n: number; mean: number | null }>>
  /**
   * The same per-date ICs grouped by each regime definition's state on the
   * signal date (R-011…R-015). The question a definition must answer: are
   * `adverse` dates where this signal stops working?
   */
  readonly byRegime: Readonly<
    Record<string, Partial<Record<RegimeState, { n: number; mean: number | null; tStat: number | null }>>>
  >
}

export interface SignalResult {
  readonly signal: string
  readonly meanTopDecileTurnover: number | null
  readonly horizons: readonly SignalHorizonResult[]
}

export interface WalkForwardReport {
  readonly dates: readonly string[]
  readonly universeSize: number
  readonly config: WalkForwardConfig
  readonly signals: readonly SignalResult[]
  /** Dates per state and state changes per definition — is the regime a
   * standable environment or a strobe light? */
  readonly regimes: Readonly<
    Record<string, { counts: Partial<Record<RegimeState, number>>; flips: number }>
  >
}

export interface LabUniverse {
  readonly calendar: readonly string[]
  readonly securities: readonly SecurityContext[]
  /** The market benchmark (SPY) on the same calendar, for regime rules. */
  readonly market?: Closes
}

interface DateObservation {
  readonly date: string
  readonly ic: number
  readonly curve: readonly (number | null)[]
  readonly regimes: Readonly<Record<string, RegimeState | null>>
}

export function walkForward(
  universe: LabUniverse,
  config: WalkForwardConfig = DEFAULT_CONFIG,
): WalkForwardReport {
  const { calendar, securities } = universe
  const maxHorizon = Math.max(...config.horizons)

  // First anchor with any chance of a full 12−1 window; walkForward does not
  // enforce per-signal history — the signals refuse themselves via Results.
  const firstAnchor = 274
  const lastAnchor = calendar.length - 1 - maxHorizon
  const anchors: number[] = []
  for (let a = firstAnchor; a <= lastAnchor; a += config.step) anchors.push(a)

  // Forward returns once per (ticker, anchor, horizon).
  const forward = (closes: Closes, anchor: number, horizon: number): number | null =>
    valueOrNull(returnBetween(closes, anchor, anchor + horizon))

  const perSignalHorizon = new Map<string, DateObservation[]>()
  const turnovers = new Map<string, number[]>()
  const previousTop = new Map<string, Set<string>>()
  const key = (signal: string, horizon: number) => `${signal}@${horizon}`
  const usedDates: string[] = []

  // Regime classification per date. The dispersion history is filled in
  // anchor order, so R-015's expanding median only ever sees earlier dates.
  const closesByTicker = new Map(securities.map((s) => [s.ticker, s.closes]))
  const dispersionHistory = new Map<number, number>()
  const definitions = universe.market
    ? regimeDefinitions({ market: universe.market, dispersionHistory })
    : []
  const regimeStates = new Map<number, Record<string, RegimeState | null>>()

  for (const anchor of anchors) {
    const date = calendar[anchor] as string
    const cross = signalPercentiles(securities, anchor)

    const dispersion = crossSectionalDispersion(closesByTicker, anchor)
    if (dispersion !== null) dispersionHistory.set(anchor, dispersion)
    const states: Record<string, RegimeState | null> = {}
    for (const definition of definitions) states[definition.id] = definition.classify(anchor)
    regimeStates.set(anchor, states)

    const forwardByHorizon = new Map<number, Map<string, number>>()
    for (const h of config.horizons) {
      const m = new Map<string, number>()
      for (const s of securities) {
        const r = forward(s.closes, anchor, h)
        if (r !== null) m.set(s.ticker, r)
      }
      forwardByHorizon.set(h, m)
    }
    usedDates.push(date)

    for (const signal of ALL_SIGNAL_IDS) {
      const p = cross.get(signal)
      if (!p || p.size < config.minCrossSection) continue

      // Top-decile turnover, horizon-independent.
      const top = new Set<string>()
      for (const [ticker, percentile] of p) if (percentile >= 0.9) top.add(ticker)
      const prev = previousTop.get(signal)
      if (prev) {
        const t = turnover(prev, top)
        if (t !== null) {
          const list = turnovers.get(signal)
          if (list) list.push(t)
          else turnovers.set(signal, [t])
        }
      }
      previousTop.set(signal, top)

      for (const h of config.horizons) {
        const fwd = forwardByHorizon.get(h) as Map<string, number>
        const xs: number[] = []
        const ys: number[] = []
        const pairs: { percentile: number; outcome: number }[] = []
        for (const [ticker, percentile] of p) {
          const r = fwd.get(ticker)
          if (r === undefined) continue
          xs.push(percentile)
          ys.push(r)
          pairs.push({ percentile, outcome: r })
        }
        if (xs.length < config.minCrossSection) continue
        const ic = spearman(xs, ys)
        if (ic === null) continue
        const k = key(signal, h)
        const observation: DateObservation = { date, ic, curve: decileMeans(pairs), regimes: states }
        const list = perSignalHorizon.get(k)
        if (list) list.push(observation)
        else perSignalHorizon.set(k, [observation])
      }
    }
  }

  const signals: SignalResult[] = ALL_SIGNAL_IDS.map((signal) => {
    const horizons: SignalHorizonResult[] = config.horizons.map((horizon) => {
      const observations = perSignalHorizon.get(key(signal, horizon)) ?? []
      const curve = averageCurves(observations.map((o) => o.curve))
      const top = curve[0] ?? null
      const bottom = curve[curve.length - 1] ?? null
      const byYear: Record<string, { n: number; mean: number | null }> = {}
      for (const [year, ics] of groupByYear(observations)) {
        const s = summarise(ics)
        byYear[year] = { n: s.n, mean: s.mean }
      }
      const byRegime: Record<
        string,
        Partial<Record<RegimeState, { n: number; mean: number | null; tStat: number | null }>>
      > = {}
      for (const definition of definitions) {
        const perState: Partial<
          Record<RegimeState, { n: number; mean: number | null; tStat: number | null }>
        > = {}
        for (const state of ['normal', 'adverse'] as const) {
          const ics = observations
            .filter((o) => o.regimes[definition.id] === state)
            .map((o) => o.ic)
          if (ics.length === 0) continue
          const s = summarise(ics)
          perState[state] = { n: s.n, mean: s.mean, tStat: s.tStat }
        }
        byRegime[definition.id] = perState
      }
      return {
        signal,
        horizon,
        ic: summarise(observations.map((o) => o.ic)),
        overlapping: horizon > config.step,
        decileCurve: curve,
        monotonicity: monotonicity(curve),
        spread: top !== null && bottom !== null ? top - bottom : null,
        byYear,
        byRegime,
      }
    })
    const t = turnovers.get(signal) ?? []
    return {
      signal,
      meanTopDecileTurnover: t.length > 0 ? t.reduce((a, b) => a + b, 0) / t.length : null,
      horizons,
    }
  })

  const regimes: Record<string, { counts: Partial<Record<RegimeState, number>>; flips: number }> =
    {}
  for (const definition of definitions) {
    const counts: Partial<Record<RegimeState, number>> = {}
    let flips = 0
    let previous: RegimeState | null = null
    for (const anchor of anchors) {
      const state = regimeStates.get(anchor)?.[definition.id] ?? null
      if (state === null) continue
      counts[state] = (counts[state] ?? 0) + 1
      if (previous !== null && state !== previous) flips++
      previous = state
    }
    regimes[definition.id] = { counts, flips }
  }

  return { dates: usedDates, universeSize: securities.length, config, signals, regimes }
}

function averageCurves(curves: readonly (readonly (number | null)[])[]): (number | null)[] {
  if (curves.length === 0) return []
  const buckets = (curves[0] as readonly (number | null)[]).length
  const sums = Array.from({ length: buckets }, () => 0)
  const counts = Array.from({ length: buckets }, () => 0)
  for (const curve of curves) {
    curve.forEach((value, i) => {
      if (value === null) return
      sums[i] = (sums[i] as number) + value
      counts[i] = (counts[i] as number) + 1
    })
  }
  return sums.map((sum, i) => ((counts[i] as number) > 0 ? sum / (counts[i] as number) : null))
}

function groupByYear(observations: readonly DateObservation[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const o of observations) {
    const year = o.date.slice(0, 4)
    const list = out.get(year)
    if (list) list.push(o.ic)
    else out.set(year, [o.ic])
  }
  return out
}
