import type { MarketRegime } from '../../domain/regime.ts'
import { DRAWDOWN_LINE } from '../../domain/regime.ts'

/**
 * The market regime as a meter instead of a sentence.
 *
 * One reading against one threshold: where SPY sits relative to its 52-week
 * high, with the 10%-drawdown line — the boundary the regime classification
 * actually uses — marked on the track. The dot is the market today; right of
 * the tick is the territory where momentum rankings have historically been
 * informative, left of it where they have historically weakened.
 *
 * The state word stays beside the meter so the classification is never
 * carried by color alone, and because one input cannot show everything: a
 * market near its high but negative over six months reads Caution with the
 * dot in the calm zone. The full inputs and definitions live in Settings —
 * this row is a glance, not the explanation.
 */

/** Left edge of the track: 25% below the high. Deeper clamps to the edge. */
const SCALE_FLOOR = 0.75

export function RegimeMeter({ market }: { market: MarketRegime }) {
  const position = (value: number) =>
    `${(Math.min(Math.max((value - SCALE_FLOOR) / (1 - SCALE_FLOOR), 0), 1) * 100).toFixed(1)}%`

  const stateWord =
    market.state === 'reversal-risk'
      ? 'Reversal risk'
      : market.state === 'caution'
        ? 'Caution'
        : 'Normal'

  const below = (1 - market.fromHigh) * 100
  const title = `SPY ${below < 0.05 ? 'at' : `${below.toFixed(1)}% below`} its 52-week high`

  return (
    <div className={`regime regime-${market.state}`} title={title}>
      <span className="regime-label">SPY vs 52-wk high</span>
      <span className="regime-track" aria-hidden="true">
        <span className="regime-tick" style={{ left: position(DRAWDOWN_LINE) }} />
        <span className="regime-dot" style={{ left: position(market.fromHigh) }} />
      </span>
      <span className="regime-state">{stateWord}</span>
    </div>
  )
}
