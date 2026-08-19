import {
  distanceFromHigh,
  realisedVolatility,
  valueOrNull,
  windowReturn,
  type Closes,
} from '../src/engine/index.ts'

/**
 * Candidate momentum-regime definitions, R-011…R-015.
 *
 * Each is a transparent rule that labels a rebalance date `normal` or
 * `adverse` using only information available at that date. Thresholds are
 * fixed a priori (registered before testing) — the one adaptive rule, R-015,
 * compares today's dispersion to the expanding median of strictly earlier
 * dates, so nothing anywhere is fitted on the full sample.
 *
 * These are evaluated *about* signals, not *as* signals: the walk-forward
 * groups each signal's per-date ICs by regime state, and the question is
 * whether any definition cleanly separates the dates where momentum worked
 * from the dates where it reversed.
 */

export type RegimeState = 'normal' | 'adverse'

export interface RegimeDefinition {
  readonly id: string
  /** Labels one anchor date, or null when history is insufficient to say. */
  readonly classify: (anchor: number) => RegimeState | null
}

export interface RegimeInputs {
  /** The market benchmark (SPY), aligned to the shared calendar. */
  readonly market: Closes
  /**
   * Cross-sectional interquartile range of the universe's 63-day returns at
   * each rebalance anchor, in anchor order — the walk-forward supplies these
   * as it goes, so R-015's expanding median sees only completed dates.
   */
  readonly dispersionHistory: ReadonlyMap<number, number>
}

const YEAR = 252
const DRAWDOWN_LINE = 0.9
const VOL_LINE = 0.2
const REBOUND_LINE = 0.05

export function regimeDefinitions(inputs: RegimeInputs): readonly RegimeDefinition[] {
  const { market } = inputs

  const fromHigh = (anchor: number) => valueOrNull(distanceFromHigh(market, YEAR, anchor))
  const trend = (anchor: number) => valueOrNull(windowReturn(market, { formation: 126, skip: 0 }, anchor))
  const vol = (anchor: number) => valueOrNull(realisedVolatility(market, 63, anchor))
  const month = (anchor: number) => valueOrNull(windowReturn(market, { formation: 21, skip: 0 }, anchor))

  return [
    {
      id: 'drawdown',
      classify: (anchor) => {
        const d = fromHigh(anchor)
        return d === null ? null : d < DRAWDOWN_LINE ? 'adverse' : 'normal'
      },
    },
    {
      id: 'trend',
      classify: (anchor) => {
        const t = trend(anchor)
        return t === null ? null : t < 0 ? 'adverse' : 'normal'
      },
    },
    {
      id: 'volatility',
      classify: (anchor) => {
        const v = vol(anchor)
        return v === null ? null : v > VOL_LINE ? 'adverse' : 'normal'
      },
    },
    {
      id: 'rebound',
      classify: (anchor) => {
        const d = fromHigh(anchor)
        const m = month(anchor)
        if (d === null || m === null) return null
        return d < DRAWDOWN_LINE && m > REBOUND_LINE ? 'adverse' : 'normal'
      },
    },
    {
      id: 'dispersion',
      classify: (anchor) => {
        const today = inputs.dispersionHistory.get(anchor)
        if (today === undefined) return null
        const past: number[] = []
        for (const [a, v] of inputs.dispersionHistory) if (a < anchor) past.push(v)
        // The first dates have no history to compare against; refusing to
        // classify them is the honest answer.
        if (past.length < 12) return null
        const sorted = past.toSorted((x, y) => x - y)
        const mid = Math.floor(sorted.length / 2)
        const median =
          sorted.length % 2 === 1
            ? (sorted[mid] as number)
            : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
        return today > median ? 'adverse' : 'normal'
      },
    },
  ]
}

/**
 * Interquartile range of the universe's `formation`-day returns at an anchor
 * — the dispersion input to R-015. Null when fewer than 100 names have a
 * return, since a spread across a thin cross-section is noise.
 */
export function crossSectionalDispersion(
  closesByTicker: ReadonlyMap<string, Closes>,
  anchor: number,
  formation = 63,
): number | null {
  const values: number[] = []
  for (const closes of closesByTicker.values()) {
    const r = valueOrNull(windowReturn(closes, { formation, skip: 0 }, anchor))
    if (r !== null) values.push(r)
  }
  if (values.length < 100) return null
  const sorted = values.toSorted((a, b) => a - b)
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number
  return q(0.75) - q(0.25)
}
