import type { PriceSeries } from '../data/types.ts'

/**
 * A rankable measure derived from a price series.
 *
 * Metrics are data, not branches. The card layout, the sort, the toggle and
 * the formatting all read from this shape, so adding the market-residualized
 * return this dataset is sized for means adding one entry to the registry —
 * not touching the ranking, the UI, or anything already here.
 */
export interface Metric {
  /** Stable identifier; also the value persisted in the URL. */
  readonly id: string
  /** Full name, used for the toggle and the accessible label. */
  readonly label: string
  /** Column heading on a card. Kept short enough for a narrow phone. */
  readonly shortLabel: string
  /** One line explaining what the number means. */
  readonly description: string
  /** Computes the value, or `null` when the series cannot support it. */
  readonly compute: (series: PriceSeries) => number | null
  /** Renders a computed value for display. */
  readonly format: (value: number) => string
  /**
   * Which end of the scale ranks first. `'desc'` puts the largest value at
   * the top (more momentum is better); `'asc'` puts the smallest first
   * (less volatility is better).
   */
  readonly direction: 'asc' | 'desc'
  /** Whether the value reads as directional, so it can be signed. */
  readonly signed: boolean
}
