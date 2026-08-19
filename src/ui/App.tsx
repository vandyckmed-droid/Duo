import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadDataset, type Dataset } from '../data/dataset.ts'
import { metric as metricById } from '../domain/metrics.ts'
import { screen as runScreen, sectorsOf, type Screen } from '../domain/screen.ts'
import { segmentDefinition } from '../domain/segments.ts'
import { isoToDisplay } from '../domain/format.ts'
import { describeRegime } from '../domain/regime.ts'
import * as state from '../state/viewState.ts'
import { Controls } from './components/Controls.tsx'
import { RankedList } from './components/RankedList.tsx'
import { GroupSummary } from './GroupSummary.tsx'
import { PortfolioView } from './PortfolioView.tsx'
import { SettingsView } from './SettingsView.tsx'
import { TickerDetail } from './TickerDetail.tsx'

/**
 * The app opens directly into the ranked list.
 *
 * There is no landing page and no dashboard: the first thing on screen is the
 * answer to "what deserves my attention right now?", already sorted. The four
 * tabs are shallow — Ranked, Watchlist, Portfolio, Settings — and the watchlist
 * is the ranked list with one filter applied, running the same engine, not a
 * second experience.
 *
 * Every interaction below is local. The dataset is fetched once; after that,
 * changing metric, segment, sector, direction or watchlist state is a sort over
 * an array in memory.
 */

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<state.ViewState>(() => state.load())
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadDataset().then(setDataset, (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  /*
   * Persistence, kept off the scroll path.
   *
   * Scroll position is part of what should survive a reload, but it changes on
   * every frame of a flick. Routing it through React state would rerender the
   * tree and serialise the whole view into localStorage sixty times a second,
   * which is exactly the stutter this list exists to avoid. So it lives in a
   * ref and the write is debounced, with a flush when the page is hidden —
   * on a phone that is usually the last moment before the tab is frozen.
   */
  const latest = useRef(view)
  latest.current = view
  const scrollTop = useRef(view.scrollTop)
  const initialScroll = useRef(view.scrollTop)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (pending.current !== null) {
      clearTimeout(pending.current)
      pending.current = null
    }
    state.save({ ...latest.current, scrollTop: scrollTop.current })
  }, [])

  const schedule = useCallback(() => {
    if (pending.current !== null) return
    pending.current = setTimeout(() => {
      pending.current = null
      state.save({ ...latest.current, scrollTop: scrollTop.current })
    }, 400)
  }, [])

  useEffect(() => {
    schedule()
  }, [view, schedule])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [flush])

  const patch = useCallback((next: Partial<state.ViewState>) => {
    setView((current) => ({ ...current, ...next }))
  }, [])

  const patchScreen = useCallback((next: Partial<Screen>) => {
    // A ranking change returns the list to the top; see RankedList.
    setView((current) => ({ ...current, screen: { ...current.screen, ...next } }))
  }, [])

  const toggleWatch = useCallback((ticker: string) => {
    setView((current) => ({ ...current, watchlist: state.toggleWatch(current.watchlist, ticker) }))
  }, [])

  const setScrollTop = useCallback(
    (top: number) => {
      scrollTop.current = top
      schedule()
    },
    [schedule],
  )

  const watchlist = useMemo(() => new Set(view.watchlist), [view.watchlist])
  const securities = dataset?.universe.securities ?? []
  const sectors = useMemo(() => sectorsOf(securities), [securities])

  const onWatchlistTab = view.tab === 'watchlist'
  const effectiveScreen: Screen = useMemo(
    () => ({ ...view.screen, watchlistOnly: view.screen.watchlistOnly || onWatchlistTab }),
    [view.screen, onWatchlistTab],
  )

  const result = useMemo(
    () => runScreen(securities, effectiveScreen, watchlist),
    [securities, effectiveScreen, watchlist],
  )

  const activeMetric = metricById(view.screen.metricId)
  const open = view.open ? securities.find((s) => s.ticker === view.open) : undefined
  const openRow = open ? [...result.rows, ...result.unranked].find((r) => r.security.ticker === open.ticker) : undefined

  const watchedSecurities = useMemo(
    () => view.watchlist.map((t) => securities.find((s) => s.ticker === t)).filter((s) => !!s),
    [view.watchlist, securities],
  )

  if (error) {
    return (
      <div className="app">
        <p className="empty">
          The dataset could not be loaded.
          <br />
          <span className="faint">{error}</span>
        </p>
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="app">
        <div className="loading">Loading the ranking…</div>
      </div>
    )
  }

  const scope = describeScope(effectiveScreen, result.total)

  return (
    <div className="app">
      <header className="head">
        <div className="head-top">
          <h1 className="title">
            {view.tab === 'portfolio'
              ? 'Portfolio'
              : view.tab === 'settings'
                ? 'Settings'
                : onWatchlistTab
                  ? 'Watchlist'
                  : 'Ranked'}
          </h1>
          <div className="head-meta">
            {view.tab === 'settings' ? (
              <>S&amp;P 1500 · {dataset.manifest.counts.total} names</>
            ) : (
              <>
                {view.tab === 'portfolio' ? view.watchlist.length : result.total} name
                {(view.tab === 'portfolio' ? view.watchlist.length : result.total) === 1 ? '' : 's'}
                <br />
                {isoToDisplay(dataset.manifest.asOf)}
              </>
            )}
          </div>
        </div>

        {(view.tab === 'ranked' || onWatchlistTab) && (
          <Controls
            screen={view.screen}
            metric={activeMetric}
            sectors={sectors}
            showFilters={showFilters}
            counts={{ shown: result.total, total: securities.length }}
            onChange={patchScreen}
            onToggleFilters={() => setShowFilters((v) => !v)}
          />
        )}

        {(view.tab === 'ranked' || onWatchlistTab) && dataset.manifest.market && (
          <p className={`regime regime-${dataset.manifest.market.state}`}>
            {describeRegime(dataset.manifest.market)}
          </p>
        )}
      </header>

      {view.tab === 'ranked' && (
        <RankedList
          result={result}
          metric={activeMetric}
          watchlist={watchlist}
          onOpen={(ticker) => patch({ open: ticker })}
          onToggleWatch={toggleWatch}
          initialScrollTop={initialScroll.current}
          onScroll={setScrollTop}
          resetKey={rankingKey(effectiveScreen)}
          emptyMessage="No names match these filters."
        />
      )}

      {onWatchlistTab && (
        <>
          <GroupSummary securities={result.rows.map((r) => r.security)} metric={activeMetric} />
          <RankedList
            result={result}
            metric={activeMetric}
            watchlist={watchlist}
            onOpen={(ticker) => patch({ open: ticker })}
            onToggleWatch={toggleWatch}
            initialScrollTop={0}
            onScroll={() => {}}
            resetKey={rankingKey(effectiveScreen)}
            emptyMessage="Nothing on the watchlist yet. Tap the left edge of any row to add it."
          />
        </>
      )}

      {view.tab === 'portfolio' && (
        <PortfolioView
          securities={watchedSecurities}
          scheme={view.scheme}
          capPerHolding={view.capPerHolding}
          capPerSector={view.capPerSector}
          onChange={patch}
          onOpen={(ticker) => patch({ open: ticker })}
        />
      )}

      {view.tab === 'settings' && (
        <SettingsView
          manifest={dataset.manifest}
          watchlistSize={view.watchlist.length}
          onClearWatchlist={() => patch({ watchlist: [] })}
        />
      )}

      <nav className="nav">
        {(['ranked', 'watchlist', 'portfolio', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            aria-current={view.tab === tab ? 'page' : undefined}
            onClick={() => patch({ tab })}
          >
            {LABELS[tab]}
            {tab === 'watchlist' && view.watchlist.length > 0 && (
              <span className="badge num">{view.watchlist.length}</span>
            )}
          </button>
        ))}
      </nav>

      {open && (
        <TickerDetail
          security={open}
          activeMetricId={view.screen.metricId}
          rank={openRow && openRow.rank > 0 ? openRow.rank : null}
          rankChange={openRow?.change ?? null}
          rankScope={scope}
          watched={watchlist.has(open.ticker)}
          onToggleWatch={toggleWatch}
          onClose={() => patch({ open: null })}
        />
      )}
    </div>
  )
}

const LABELS = {
  ranked: 'Ranked',
  watchlist: 'Watchlist',
  portfolio: 'Portfolio',
  settings: 'Settings',
} as const

/** Identity of the current ordering, used to reset the scroll on a rerank. */
function rankingKey(screen: Screen): string {
  return [screen.metricId, screen.segment, screen.sector, screen.watchlistOnly, screen.invert, screen.query].join(
    '|',
  )
}

/** Plain-English description of what a rank is a rank *of*. */
function describeScope(screen: Screen, total: number): string {
  const parts: string[] = []
  if (screen.watchlistOnly) parts.push('the watchlist')
  else if (screen.segment) parts.push(`the ${segmentDefinition(screen.segment).indexName}`)
  else parts.push('the S&P 1500')
  if (screen.sector) parts.push(screen.sector)
  if (screen.query.trim()) parts.push(`matching “${screen.query.trim()}”`)
  return `${parts.join(', ')} — ${total} name${total === 1 ? '' : 's'}`
}
