import { useEffect, useMemo, useState } from 'react'
import { UNIVERSE, loadPriceData, type PriceData } from './data/index.ts'
import {
  METRICS,
  computeMetricValues,
  metricById,
  metricHiddenWhenNarrow,
  rankValues,
} from './metrics/index.ts'
import { StockRow } from './ui/StockRow.tsx'

/** Where the generated dataset is served from, relative to the app's base. */
const PRICES_URL = `${import.meta.env.BASE_URL}data/prices.json`

/**
 * The metric id lives in the URL hash so a ranking can be linked and
 * reloaded as seen, without pulling in a router for one value.
 */
function metricIdFromHash(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('metric') ?? ''
}

export default function App() {
  const [priceData, setPriceData] = useState<PriceData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [metricId, setMetricId] = useState(metricIdFromHash)

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
    const sync = () => setMetricId(metricIdFromHash())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const activeMetric = metricById(metricId)

  // Values depend only on the data; only the ordering depends on the toggle.
  const values = useMemo(
    () => (priceData ? computeMetricValues(UNIVERSE, priceData) : []),
    [priceData],
  )

  const ranked = useMemo(
    () => rankValues(values, activeMetric),
    [values, activeMetric],
  )

  const hiddenWhenNarrowId = metricHiddenWhenNarrow(METRICS, activeMetric.id)

  const selectMetric = (id: string) => {
    window.location.hash = `metric=${id}`
    setMetricId(id)
  }

  return (
    // The grid widens itself when a metric is added to the registry.
    <main style={{ '--metric-count': METRICS.length } as React.CSSProperties}>
      <header className="masthead">
        <h1>Duo</h1>
        <p className="subtitle">
          S&amp;P MidCap 400 · ranked by {activeMetric.label.toLowerCase()}
        </p>
      </header>

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
            onClick={() => selectMetric(metric.id)}
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
              />
            ))}
          </ol>
          <footer className="colophon">
            {ranked.length} constituents · {activeMetric.description} Prices
            as of {priceData.generatedAt}.
          </footer>
        </>
      )}
    </main>
  )
}
