import { useMemo, useState } from 'react'
import { BLENDED_MOMENTUM, rankUniverse } from '../calc/ranking.ts'
import { applyFilters, type Filters, NO_FILTERS, sectorsOf } from '../state/filters.ts'
import { BasketView } from './components/BasketView.tsx'
import { FilterBar } from './components/FilterBar.tsx'
import { RankedList } from './components/RankedList.tsx'
import { type Tab, TabBar } from './components/TabBar.tsx'
import { WatchlistView } from './components/WatchlistView.tsx'
import { formatAsOf } from './format.ts'
import { useBasket, useDataset, useWatchlist } from './hooks.ts'

/**
 * The app: one dataset in, three views of it.
 *
 * Everything numeric happened before this file — the pipeline computed the
 * signals, `rankUniverse` normalised and blended them under the V1 spec. From
 * here down it is presentation and the user's own state.
 */
export function App() {
  const dataset = useDataset()
  const basket = useBasket()
  const watchlist = useWatchlist()
  const [tab, setTab] = useState<Tab>('ranking')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)

  const ranked = useMemo(
    () => (dataset.status === 'ready' ? rankUniverse(dataset.universe.securities, BLENDED_MOMENTUM) : []),
    [dataset],
  )
  const byTicker = useMemo(() => new Map(ranked.map((r) => [r.security.ticker, r])), [ranked])
  const sectors = useMemo(() => sectorsOf(ranked), [ranked])
  const filtered = useMemo(() => applyFilters(ranked, filters), [ranked, filters])

  return (
    <div className="app">
      <header className="header">
        <h1 className="wordmark">Duo</h1>
        <span className="header-meta">
          S&amp;P 1500{dataset.status === 'ready' && <> · {formatAsOf(dataset.universe.asOf)}</>}
        </span>
      </header>

      {dataset.status === 'loading' && <div className="notice">Loading the universe…</div>}
      {dataset.status === 'error' && (
        <div className="notice">
          <p className="empty-title">Couldn't load the dataset</p>
          <p>Check the connection and pull to reload.</p>
        </div>
      )}
      {dataset.status === 'missing' && (
        <div className="notice">
          <p className="empty-title">No dataset published yet</p>
          <p>
            The daily refresh hasn't run since this version was deployed. The ranking will appear
            once it publishes.
          </p>
        </div>
      )}

      {dataset.status === 'ready' && (
        <main className="content">
          {tab === 'ranking' && (
            <>
              <FilterBar filters={filters} sectors={sectors} onChange={setFilters} />
              <div className="list-meta">
                {filtered.length === ranked.length
                  ? `${ranked.length} stocks`
                  : `${filtered.length} of ${ranked.length} stocks`}
              </div>
              {filtered.length === 0 ? (
                <div className="empty">
                  <p className="empty-title">No matches</p>
                  <p>Nothing in the universe fits these filters.</p>
                </div>
              ) : (
                <RankedList
                  rows={filtered}
                  isSelected={(t) => basket.tickers.has(t)}
                  isWatched={(t) => watchlist.tickers.has(t)}
                  onToggleSelect={basket.toggle}
                  onToggleWatch={watchlist.toggle}
                />
              )}
            </>
          )}
          {tab === 'watchlist' && (
            <WatchlistView ranked={ranked} watchlist={watchlist} basket={basket} />
          )}
          {tab === 'basket' && <BasketView store={basket} byTicker={byTicker} />}
        </main>
      )}

      <TabBar
        tab={tab}
        watchCount={watchlist.tickers.size}
        basketCount={basket.basket.length}
        onChange={setTab}
      />
    </div>
  )
}
