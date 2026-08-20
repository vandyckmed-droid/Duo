import { memo } from 'react'
import type { RankedSecurity } from '../../calc/ranking.ts'

import { formatScore } from '../format.ts'
import { RangeBar } from './RangeBar.tsx'

/** A ranked row as displayed: in Diversified mode `rank` is the position in
 * the diversified list and `rawRank` keeps the signal's own rank visible. */
export interface DisplayRow extends RankedSecurity {
  readonly rawRank?: number
}

/**
 * One line of the product: Rank · Ticker · Company · Score · Sector, with the
 * 52-week range underneath. Tapping the row toggles selection into the
 * basket; the star toggles the watchlist.
 */
export const SecurityRow = memo(function SecurityRow({
  row,
  selected,
  watched,
  onToggleSelect,
  onToggleWatch,
}: {
  row: DisplayRow
  selected: boolean
  watched: boolean
  onToggleSelect: (ticker: string) => void
  onToggleWatch: (ticker: string) => void
}) {
  const s = row.security
  return (
    <li className={`row${selected ? ' is-selected' : ''}`}>
      <button
        type="button"
        className="row-main"
        aria-pressed={selected}
        aria-label={`${s.ticker} rank ${row.rank}, score ${formatScore(row.score)}. ${selected ? 'Remove from' : 'Add to'} basket`}
        onClick={() => onToggleSelect(s.ticker)}
      >
        <div className="row-line">
          <span className="row-rank">{row.rank}</span>
          <span className="row-ticker">{s.ticker}</span>
          {row.rawRank !== undefined && <span className="row-raw-rank">Raw #{row.rawRank}</span>}
          <span className="row-score">{formatScore(row.score)}</span>
        </div>
        <div className="row-line">
          <span className="row-name">{s.name}</span>
          <span className="row-sector">{s.sector}</span>
        </div>
        <RangeBar low={s.low52} high={s.high52} last={s.last} />
      </button>
      <button
        type="button"
        className={`row-watch${watched ? ' is-watched' : ''}`}
        aria-pressed={watched}
        aria-label={`${watched ? 'Remove' : 'Add'} ${s.ticker} ${watched ? 'from' : 'to'} watchlist`}
        onClick={() => onToggleWatch(s.ticker)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 3.6l2.47 5.34 5.83.66-4.33 3.98 1.17 5.76L12 16.42l-5.14 2.92 1.17-5.76-4.33-3.98 5.83-.66z"
            fill={watched ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </li>
  )
})
