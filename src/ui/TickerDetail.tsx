import { useEffect, useMemo, useState } from 'react'
import type { SecurityRecord, SeriesFile } from '../domain/dataset.ts'
import { loadSeries } from '../data/dataset.ts'
import { METRICS, metric as metricById } from '../domain/metrics.ts'
import { segmentDefinition } from '../domain/segments.ts'
import {
  EMPTY,
  isoToDisplay,
  marketCap,
  percent,
  percentPlain,
  price,
  ratio,
  signedInteger,
  sign,
} from '../domain/format.ts'
import { PriceChart } from './components/PriceChart.tsx'

/**
 * Level 2 — investigate.
 *
 * The chart comes first and takes the space, because the first question about
 * a name that ranked well is "what does it look like?". Below it the statistics
 * are ordered by how often they are the reason someone opened this screen:
 * the metric that ranked the name, then returns across horizons, then risk,
 * then the market-model numbers, then identity.
 *
 * It is not a field dump. Every row is labelled with what it means, beta names
 * the benchmark it was measured against, and anything unavailable says so.
 */

const HORIZONS = [
  { id: '1M', label: '1M', days: 21 },
  { id: '3M', label: '3M', days: 63 },
  { id: '6M', label: '6M', days: 126 },
  { id: '1Y', label: '1Y', days: 252 },
  { id: '3Y', label: '3Y', days: 756 },
] as const

type HorizonId = (typeof HORIZONS)[number]['id']

interface Props {
  readonly security: SecurityRecord
  readonly activeMetricId: string
  readonly rank: number | null
  readonly rankChange: number | null
  readonly rankScope: string
  readonly watched: boolean
  readonly onToggleWatch: (ticker: string) => void
  readonly onClose: () => void
}

export function TickerDetail({
  security,
  activeMetricId,
  rank,
  rankChange,
  rankScope,
  watched,
  onToggleWatch,
  onClose,
}: Props) {
  const [series, setSeries] = useState<SeriesFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [horizon, setHorizon] = useState<HorizonId>('1Y')

  useEffect(() => {
    let live = true
    setLoading(true)
    setSeries(null)
    loadSeries(security.ticker).then((file) => {
      if (!live) return
      setSeries(file)
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [security.ticker])

  const points = useMemo(() => {
    if (!series) return []
    const days = HORIZONS.find((h) => h.id === horizon)?.days ?? 252
    const from = Math.max(0, series.dates.length - days - 1)
    return series.dates.slice(from).map((date, i) => ({
      date,
      close: series.closes[from + i] ?? null,
    }))
  }, [series, horizon])

  const active = metricById(activeMetricId)
  const segment = segmentDefinition(security.segment)
  const rangePosition =
    security.low52 !== null && security.high52 !== null && security.high52 > security.low52 && security.last !== null
      ? ((security.last - security.low52) / (security.high52 - security.low52)) * 100
      : null

  return (
    <div className="detail" role="dialog" aria-label={`${security.ticker} detail`}>
      <div className="detail-head">
        <button className="back" onClick={onClose} aria-label="Back to the list">
          ‹
        </button>
        <div className="detail-id">
          <div className="detail-ticker">{security.ticker}</div>
          <div className="detail-name">
            {security.name} · {segment.indexName}
          </div>
        </div>
        <button
          className="watch-button"
          aria-pressed={watched}
          onClick={() => onToggleWatch(security.ticker)}
        >
          {watched ? 'Watching' : 'Watch'}
        </button>
      </div>

      <div className="detail-body">
        {loading ? (
          <div className="loading" style={{ height: 260 }}>
            Loading price history…
          </div>
        ) : (
          <PriceChart points={points} label={horizon} />
        )}

        <div className="horizons" role="group" aria-label="Chart horizon">
          {HORIZONS.map((h) => (
            <button key={h.id} aria-pressed={horizon === h.id} onClick={() => setHorizon(h.id)}>
              {h.label}
            </button>
          ))}
        </div>

        {/* What ranked this name, and where it stands. */}
        <div className="headline">
          <div className="headline-cell">
            <div className="headline-label">{active.label}</div>
            <div
              className={`headline-value num ${toneOf(active.id, active.value(security))}`}
            >
              {active.kind === 'rank-change'
                ? signedInteger(rankChange)
                : active.format(active.value(security))}
            </div>
          </div>
          <div className="headline-cell">
            <div className="headline-label">Rank</div>
            <div className="headline-value num">
              {rank === null ? EMPTY : `#${rank}`}
              {rankChange !== null && rankChange !== 0 && (
                <span
                  className={`num ${rankChange > 0 ? 'up' : 'down'}`}
                  style={{ fontSize: 13, marginLeft: 7 }}
                >
                  {signedInteger(rankChange)}
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="prose" style={{ paddingBottom: 4 }}>
          Ranked within {rankScope}. {active.definition}
        </p>

        <Section title="Return">
          <Stat label="12−1 momentum" value={percent(security.returns['12-1'])} tone={security.returns['12-1']} />
          <Stat label="6−1 momentum" value={percent(security.returns['6-1'])} tone={security.returns['6-1']} />
          <Stat label="12 months" value={percent(security.returns['12M'])} tone={security.returns['12M']} />
          <Stat label="6 months" value={percent(security.returns['6M'])} tone={security.returns['6M']} />
          <Stat label="3 months" value={percent(security.returns['3M'])} tone={security.returns['3M']} />
          <Stat label="1 month" value={percent(security.returns['1M'])} tone={security.returns['1M']} />
        </Section>

        <Section title="Risk">
          <Stat
            label="Volatility"
            hint="Annualised, 252 trading days"
            value={percentPlain(security.volatility['1Y'])}
          />
          <Stat
            label="Volatility"
            hint="Annualised, 63 trading days"
            value={percentPlain(security.volatility['3M'])}
          />
          <Stat
            label="Return / vol"
            hint="12-month return ÷ 1-year volatility"
            value={active.id === 'return-vol' ? active.format(security.returnPerVol) : ratio(security.returnPerVol)}
            tone={security.returnPerVol}
          />
          <Stat
            label="Max drawdown"
            hint="Deepest peak-to-trough fall, trailing year"
            value={percentPlain(security.maxDrawdown)}
          />
        </Section>

        <Section title={`Market model · vs ${security.benchmark}`}>
          <Stat
            label={`β vs ${security.benchmark}`}
            hint={`${segment.benchmarkName}, ${security.betaObservations} paired days`}
            value={ratio(security.beta)}
          />
          <Stat
            label="R²"
            hint="Share of this name's variance the benchmark explains"
            value={ratio(security.betaR2)}
          />
          <Stat
            label="Residual return 12M"
            hint={`12-month return − β × ${security.benchmark} over the same window`}
            value={percent(security.residuals['12M'])}
            tone={security.residuals['12M']}
          />
          <Stat
            label="Residual 12−1"
            hint="Same subtraction over the 12−1 window"
            value={percent(security.residuals['12-1'])}
            tone={security.residuals['12-1']}
          />
          <Stat
            label={`${metricById('rank-change').label}`}
            hint={`Positions climbed in the 12−1 ranking of ${rankScope}`}
            value={signedInteger(rankChange)}
            tone={rankChange}
          />
        </Section>

        <Section title="52-week range">
          <div className="range">
            {rangePosition === null ? (
              <p className="prose" style={{ padding: 0 }}>
                Not enough history for a 52-week range.
              </p>
            ) : (
              <>
                <div className="range-track">
                  <div className="range-mark" style={{ left: `${rangePosition}%` }} />
                </div>
                <div className="range-ends num">
                  <span>{price(security.low52)}</span>
                  <span className="dim">{price(security.last)}</span>
                  <span>{price(security.high52)}</span>
                </div>
              </>
            )}
          </div>
        </Section>

        <Section title="Identity">
          <Stat label="Segment" value={`${segment.indexName} (${security.segment})`} />
          <Stat label="Benchmark" value={`${security.benchmark} · ${segment.benchmarkName}`} />
          <Stat label="Sector" value={security.sector} />
          <Stat label="Industry" value={security.industry} />
          <Stat label="Market cap" value={marketCap(security.marketCap)} />
          <Stat
            label="Price history"
            hint={`${security.history.from ?? EMPTY} → ${security.history.to ?? EMPTY}`}
            value={`${security.history.days} days`}
          />
          <Stat label="Last close" value={`${price(security.last)} · ${isoToDisplay(security.lastDate)}`} />
        </Section>

        {security.stale && (
          <p className="notice">
            The provider returned no new observations for {security.ticker} on the last refresh.
            Everything above is computed from the history already held, which has not been altered.
          </p>
        )}

        <Section title="Every metric">
          {METRICS.filter((m) => m.kind === 'value').map((m) => (
            <Stat
              key={m.id}
              label={m.label}
              value={m.format(m.value(security))}
              tone={m.id === 'volatility' || m.id === 'beta' || m.id === 'market-cap' ? null : m.value(security)}
            />
          ))}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  )
}

function Stat({
  label,
  hint,
  value,
  tone,
}: {
  label: string
  hint?: string | undefined
  value: string
  tone?: number | null | undefined
}) {
  const s = tone === undefined || tone === null ? 0 : sign(tone)
  return (
    <div className="stat-row">
      <span className="stat-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className={`stat-value num ${s > 0 ? 'up' : s < 0 ? 'down' : ''}`}>{value}</span>
    </div>
  )
}

function toneOf(metricId: string, value: number | null): string {
  if (metricId === 'volatility' || metricId === 'beta' || metricId === 'market-cap') return ''
  const s = sign(value)
  return s > 0 ? 'up' : s < 0 ? 'down' : ''
}
