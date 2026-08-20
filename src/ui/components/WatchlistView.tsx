import type { RankedSecurity } from '../../calc/ranking.ts'
import type { BasketStore, WatchlistStore } from '../hooks.ts'
import { RankedList } from './RankedList.tsx'

/**
 * The watchlist: the same ranking rows and 52-week bars, filtered to saved
 * names and kept in rank order. Names that have since left the universe stay
 * listed — silently deleting a saved name would be worse — with a way out.
 */
export function WatchlistView({
  ranked,
  watchlist,
  basket,
}: {
  ranked: readonly RankedSecurity[]
  watchlist: WatchlistStore
  basket: BasketStore
}) {
  if (watchlist.tickers.size === 0) {
    return (
      <div className="empty">
        <p className="empty-title">Watchlist is empty</p>
        <p>Tap the star on any row to keep an eye on it here.</p>
      </div>
    )
  }

  const rows = ranked.filter((r) => watchlist.tickers.has(r.security.ticker))
  const present = new Set(rows.map((r) => r.security.ticker))
  const missing = watchlist.ordered.filter((t) => !present.has(t))

  return (
    <>
      <RankedList
        rows={rows}
        isSelected={(t) => basket.tickers.has(t)}
        isWatched={() => true}
        onToggleSelect={basket.toggle}
        onToggleWatch={watchlist.toggle}
      />
      {missing.length > 0 && (
        <ol className="list">
          {missing.map((ticker) => (
            <li key={ticker} className="basket-row">
              <div className="basket-main">
                <div className="row-line">
                  <span className="row-ticker">{ticker}</span>
                </div>
                <div className="row-line">
                  <span className="row-sector basket-sector">Not in the current universe</span>
                </div>
              </div>
              <button
                type="button"
                className="basket-remove"
                aria-label={`Remove ${ticker} from watchlist`}
                onClick={() => watchlist.toggle(ticker)}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
