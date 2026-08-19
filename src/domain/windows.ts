import type { Window } from '../engine/types.ts'

/**
 * The measurement windows, in trading days.
 *
 * Everything is counted in trading days rather than calendar months so that a
 * window is a fixed amount of market activity. A "12-month" window bounded by
 * dates is 250 trading days in one year and 253 in another, and the difference
 * lands squarely in a momentum score.
 *
 * Adding a horizon is adding an entry here. Nothing downstream branches on
 * which window it is holding.
 */
export const WINDOWS = {
  /** One month. */
  '1M': { formation: 21, skip: 0 },
  /** Three months — the shorter horizon, same machinery. */
  '3M': { formation: 63, skip: 0 },
  '6M': { formation: 126, skip: 0 },
  /** Raw trailing twelve months, no skip. */
  '12M': { formation: 252, skip: 0 },
  /**
   * 12−1 momentum: a year of formation ending one month before today.
   *
   * The skipped month is the "−1". Short-horizon reversal dominates the most
   * recent few weeks, so including them measures the reversal rather than the
   * momentum.
   */
  '12-1': { formation: 252, skip: 21 },
  /**
   * 6−1 momentum: half the formation period, the same one-month skip.
   *
   * The skip is what the "−1" names in both cases, and reversal operates over
   * the same few weeks regardless of how long the formation window is, so it
   * stays at 21 days while the formation halves.
   */
  '6-1': { formation: 126, skip: 21 },
} as const satisfies Record<string, Window>

export type WindowId = keyof typeof WINDOWS

export const WINDOW_IDS = Object.keys(WINDOWS) as WindowId[]

/** Volatility lookbacks, in trading days. */
export const VOLATILITY_WINDOWS = { '3M': 63, '1Y': 252 } as const
export type VolatilityWindowId = keyof typeof VOLATILITY_WINDOWS

/**
 * Beta lookback: three years of daily observations.
 *
 * Fitted over a single year the estimate is unstable enough to flip sign on
 * ordinary names; three years is long enough to settle without reaching so far
 * back that it describes a different company.
 */
export const BETA_LOOKBACK = 756

/** Max-drawdown lookback: the trailing year. */
export const DRAWDOWN_LOOKBACK = 252

/**
 * The offset used for rank change, in trading days: one quarter.
 *
 * Long enough that the change reflects a real shift in standing rather than a
 * week of noise, short enough to still be news.
 */
export const RANK_CHANGE_OFFSET = 63

/** History retained in the cache, in trading days — the beta window plus slack. */
export const HISTORY_TRADING_DAYS = BETA_LOOKBACK + RANK_CHANGE_OFFSET + 30
