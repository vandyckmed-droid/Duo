/**
 * The market momentum regime.
 *
 * Lab evidence (registry R-011…R-016, 220 monthly dates over 2007–2026):
 * momentum-family rankings carry positive forward information when the
 * market is near its high and trending, and run hard negative when it is
 * more than 10% below its trailing-year high or its six-month return is
 * negative — worst of all in sharp rallies off a deep low. The ranked list
 * is not wrong in those states, but what it measures degrades, and the one
 * honest response the interface can make is to say so.
 *
 * This is context, not advice: nothing about the ranking changes, no
 * exposure decision is made, and the three inputs are published so the
 * statement is checkable. Thresholds are the pre-registered ones.
 */

export type RegimeState = 'normal' | 'caution' | 'reversal-risk'

export interface MarketRegime {
  readonly state: RegimeState
  /** Benchmark close relative to its trailing 252-day high, in (0, 1]. */
  readonly fromHigh: number
  /** Benchmark return over the trailing 126 trading days. */
  readonly return6M: number
  /** Benchmark return over the trailing 21 trading days. */
  readonly return1M: number
}

/** Below 90% of the trailing-year high the market is in drawdown. */
export const DRAWDOWN_LINE = 0.9

/** A one-month rally above +5% while still in drawdown is the crash signature. */
export const REBOUND_LINE = 0.05

export function classifyRegime(
  fromHigh: number,
  return6M: number,
  return1M: number,
): RegimeState {
  const inDrawdown = fromHigh < DRAWDOWN_LINE
  if (inDrawdown && return1M > REBOUND_LINE) return 'reversal-risk'
  if (inDrawdown || return6M < 0) return 'caution'
  return 'normal'
}

/** The banner sentence: one factual clause, no advice. */
export function describeRegime(regime: MarketRegime): string {
  const below = Math.round((1 - regime.fromHigh) * 100)
  switch (regime.state) {
    case 'reversal-risk':
      return `Reversal risk — market ${below}% below its high and rallying hard; momentum rankings have historically inverted here`
    case 'caution':
      return regime.fromHigh < DRAWDOWN_LINE
        ? `Caution — market ${below}% below its 52-week high; momentum rankings have historically weakened here`
        : `Caution — market down over six months; momentum rankings have historically weakened here`
    case 'normal':
      return 'Normal — market near its high; momentum rankings have historically been most informative here'
  }
}
