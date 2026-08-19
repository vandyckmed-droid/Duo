import { useEffect, useMemo, useState } from 'react'
import {
  UNIVERSE,
  loadPriceData,
  resolveSector,
  sectorsIn,
  type PriceData,
} from './data/index.ts'
import {
  METRICS,
  computeMetricValues,
  filterBySector,
  metricById,
  metricHiddenWhenNarrow,
  rankValues,
} from './metrics/index.ts'
import { calculateInverseVolatilityWeights } from './portfolio/index.ts'
import { SectorFilter } from './ui/SectorFilter.tsx'
import {
  readSelection,
  toggleSelection,
  writeSelection,
} from './ui/selection.ts'
import { StockRow } from './ui/StockRow.tsx'
import { parseViewHash, viewHash } from './ui/viewState.ts'

/** Where the generated dataset is served from, relative to the app's base. */
const PRICES_URL = `${import.meta.env.BASE_URL}data/prices.json`

/** The sectors the loaded universe actually contains. Fixed for a build. */
const SECTORS = sectorsIn(UNIVERSE)

export default function App() {
  const [priceData, setPriceData] = useState<PriceData | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * Metric and sector live in the URL hash so a ranking can be linked and
   * reloaded as seen, without pulling in a router for two values.
   */
  const [view, setView] = useState(() => parseViewHash(window.location.hash))
  /**
   * Selection is independent of the view: neither the metric nor the sector
   * filter clears it, so it is its own state rather than derived from the
   * ranking. Persisted separately from the view, which lives in the hash.
   */
  const [selection, setSelection] = useState(() =>
    readSelection(window.localStorage),
  )

  useEffect(() => {
    writeSelection(window.localStorage, selection)
  }, [selection])

  useEffect(() => {
    let cancelled = false
    loadPriceData(PRICES_URL)
      .then((data) => {
        if (!cancelled) setPriceData(data)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unknown error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const sync = () => setView(parseViewHash(window.location.hash))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const activeMetric = metricById(view.metricId)
  const activeSector = resolveSector(SECTORS, view.sector)

  // Values depend only on the data; the toggle and the filter only decide
  // which of them are shown and in what order.
  const values = useMemo(
    () => (priceData ? computeMetricValues(UNIVERSE, priceData) : []),
    [priceData],
  )

  const ranked = useMemo(
    () => rankValues(filterBySector(values, activeSector), activeMetric),
    [values, activeSector, activeMetric],
  )

  const hiddenWhenNarrowId = metricHiddenWhenNarrow(METRICS, activeMetric.id)

  // Weighting reads volatility from the whole universe's values, not the
  // filtered/sorted `ranked` list, so a selection's weights stay the same
  // regardless of which sector or metric happens to be on screen.
  const weightByTicker = useMemo(() => {
    const selected = values.filter((v) => selection.has(v.stock.ticker))
    const weights = calculateInverseVolatilityWeights(
      selected.map((v) => ({
        ticker: v.stock.ticker,
        volatility: v.values.volatility ?? null,
      })),
    )
    return new Map(weights.map((w) => [w.ticker, w.weight]))
  }, [values, selection])

  const toggleSelected = (ticker: string) =>
    setSelection((current) => toggleSelection(current, ticker))

  // The active metric is written out even when it was only a default, so a
  // link always says what it is showing.
  const show = (next: Partial<{ metricId: string; sector: string | null }>) => {
    const updated = {
      metricId: activeMetric.id,
      sector: activeSector,
      ...next,
    }
    window.location.hash = viewHash(updated)
    setView(updated)
  }

  return (
    // The grid widens itself when a metric is added to the registry.
    <main style={{ '--metric-count': METRICS.length } as React.CSSProperties}>
      <header className="masthead">
        <h1>Duo</h1>
        {/* The sector is not repeated here — the filter below states it. */}
        <p className="subtitle">
          S&amp;P MidCap 400 · ranked by {activeMetric.label.toLowerCase()}
        </p>
      </header>

      <SectorFilter
        sectors={SECTORS}
        active={activeSector}
        onChange={(sector) => show({ sector })}
      />

      <div className="columns">
        <span className="rank" aria-hidden="true" />
        <span className="mark-spacer" aria-hidden="true" />
        <span className="identity column-label">Ticker</span>
        {METRICS.map((metric) => (
          <button
            key={metric.id}
            type="button"
            className={[
              'value',
              'column-label',
              metric.id === activeMetric.id ? 'column-active' : '',
              metric.id === hiddenWhenNarrowId ? 'value-hidden-narrow' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={metric.id === activeMetric.id}
            title={metric.description}
            onClick={() => show({ metricId: metric.id })}
          >
            {metric.shortLabel}
          </button>
        ))}
      </div>

      {error !== null && (
        <p className="notice">Could not load price data. {error}</p>
      )}

      {error === null && priceData === null && (
        <p className="notice">Loading…</p>
      )}

      {priceData !== null && (
        <>
          <ol className="rows">
            {ranked.map((entry) => (
              <StockRow
                key={entry.stock.ticker}
                entry={entry}
                metrics={METRICS}
                activeMetricId={activeMetric.id}
                hiddenWhenNarrowId={hiddenWhenNarrowId}
                selected={selection.has(entry.stock.ticker)}
                weight={weightByTicker.get(entry.stock.ticker)}
                onToggle={toggleSelected}
              />
            ))}
          </ol>
          <footer className="colophon">
            {activeSector === null
              ? `${ranked.length} constituents`
              : `${ranked.length} of ${values.length} constituents`}{' '}
            · {activeMetric.description} Prices as of {priceData.generatedAt}.
          </footer>
        </>
      )}
    </main>
  )
}
