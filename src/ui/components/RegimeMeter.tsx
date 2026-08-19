import type { MarketRegime } from '../../domain/regime.ts'
import { DRAWDOWN_LINE } from '../../domain/regime.ts'

/**
 * The market regime as a meter that explains itself.
 *
 * The track is the last 25% of SPY's range below its 52-week high, split
 * into two colored zones at the 10%-drawdown line — the boundary the regime
 * classification actually uses. Green territory is where momentum rankings
 * have historically been informative; the amber-to-red territory left of
 * the boundary is where they have historically weakened. The dot is the
 * market today, wearing the state's color, and the chip says the state in a
 * word so color never carries the classification alone.
 *
 * A number rides under the label — how far below the high SPY actually is —
 * because a meter without its reading invites squinting. One input cannot
 * show everything: a market near its high but negative over six months
 * reads Caution with the dot in green territory, and the chip wins. The
 * full inputs and definitions live in Settings; this row is a glance.
 */

/** Left edge of the track: 25% below the high. Deeper clamps to the edge. */
const SCALE_FLOOR = 0.75

export function RegimeMeter({ market }: { market: MarketRegime }) {
  const pos = (value: number) =>
    Math.min(Math.max((value - SCALE_FLOOR) / (1 - SCALE_FLOOR), 0), 1) * 100

  const stateWord =
    market.state === 'reversal-risk'
      ? 'Reversal risk'
      : market.state === 'caution'
        ? 'Caution'
        : 'Normal'

  const below = (1 - market.fromHigh) * 100
  const reading = below < 0.05 ? 'At high' : `−${below.toFixed(1)}%`
  const title = `SPY ${below < 0.05 ? 'at' : `${below.toFixed(1)}% below`} its 52-week high`

  return (
    <div className={`regime regime-${market.state}`} title={title}>
      <span className="regime-id">
        <span className="regime-kicker">SPY vs 52w high</span>
        <span className="regime-read num">{reading}</span>
      </span>
      <span
        className="regime-track"
        aria-hidden="true"
        style={{ '--tick': `${pos(DRAWDOWN_LINE).toFixed(1)}%` } as React.CSSProperties}
      >
        <span className="regime-zone-weak" />
        <span className="regime-zone-fair" />
        <span className="regime-dot" style={{ left: `${pos(market.fromHigh).toFixed(1)}%` }} />
      </span>
      <span className="regime-chip">{stateWord}</span>
    </div>
  )
}
