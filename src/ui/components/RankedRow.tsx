import { memo } from 'react'
import type { Row } from '../../domain/screen.ts'
import { metric as metricById, type Metric } from '../../domain/metrics.ts'
import { EMPTY, marketCap, signedInteger, sign } from '../../domain/format.ts'

/**
 * One row of the ranked list.
 *
 * Rank, identity, the active metric, and watchlist state. The metric value is
 * the largest thing in the row because it is the reason the row is where it
 * is; everything else is there to identify the name and is deliberately quiet.
 *
 * The row is one shape for every metric. Switching from 12−1 to market cap
 * changes what the value cell says, not how the row is built — which is what
 * lets a new metric be an entry in a registry rather than a redesign.
 */

interface Props {
  readonly row: Row
  readonly metric: Metric
  readonly watched: boolean
  readonly onOpen: (ticker: string) => void
  readonly onToggleWatch: (ticker: string) => void
  readonly top: number
  readonly height: number
}

function RankedRowImpl({ row, metric, watched, onOpen, onToggleWatch, top, height }: Props) {
  const { security } = row
  // Colour by sign only where the sign is the point. A market cap or a
  // volatility is not "good" or "bad", and colouring it would say it was.
  const signed = metric.id !== 'market-cap' && metric.id !== 'volatility' && metric.id !== 'beta'
  const tone = signed ? sign(row.value) : 0
  const basis = metricById(metric.basedOn ?? metric.id)

  return (
    <div
      className="row"
      style={{ position: 'absolute', top, height, left: 0, right: 0 }}
    >
      <button
        className="watch"
        aria-pressed={watched}
        aria-label={`${watched ? 'Remove' : 'Add'} ${security.ticker} ${watched ? 'from' : 'to'} watchlist`}
        onClick={() => onToggleWatch(security.ticker)}
      >
        <span className="watch-mark" />
      </button>

      <button className="row-open" onClick={() => onOpen(security.ticker)}>
        <span className="rank num">{row.rank > 0 ? row.rank : EMPTY}</span>
        <span className="identity">
          <span className="ticker">{security.ticker}</span>
          <span className="company">
            {security.name}
            <span className="tag">
              {' · '}
              {security.segment}
              {security.marketCap ? ` · ${marketCap(security.marketCap)}` : ''}
            </span>
          </span>
        </span>
        <span className="value">
          <span
            className={`value-main num ${tone > 0 ? 'up' : tone < 0 ? 'down' : 'flat'}`}
          >
            {metric.format(row.value)}
          </span>
          <span className="value-sub num">
            {/* When the ranking *is* the movement, the secondary line shows the
                underlying value that moved; otherwise it shows the movement. */}
            {metric.kind === 'rank-change'
              ? basis.format(basis.value(security))
              : row.change === null || row.change === 0
                ? EMPTY
                : `${signedInteger(row.change)} rank`}
          </span>
        </span>
      </button>
    </div>
  )
}

export const RankedRow = memo(RankedRowImpl)
