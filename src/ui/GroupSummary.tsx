import { useEffect, useState } from 'react'
import type { SecurityRecord } from '../domain/dataset.ts'
import { loadSeriesMany } from '../data/dataset.ts'
import {
  averageCorrelation,
  correlationMatrix,
  sectorConcentration,
  summarise,
  synchronisedReturns,
} from '../engine/index.ts'
import type { Metric } from '../domain/metrics.ts'
import { EMPTY, percent, percentPlain, ratio } from '../domain/format.ts'

/**
 * What is this group behaving like?
 *
 * Not an average of everything. A watchlist of twenty names split ten up and
 * ten down averages to nothing while describing two completely different
 * groups, so the split comes first, the spread comes second, and the average
 * is one fact among several rather than the answer.
 *
 * Correlation and dispersion are the two numbers that say whether the group is
 * one bet or several. They need synchronised daily returns, so the price
 * series are fetched here — the only place in the app that fetches on a user's
 * behalf, and only for the handful of names actually in the group.
 */

interface Props {
  readonly securities: readonly SecurityRecord[]
  readonly metric: Metric
}

interface Correlation {
  readonly average: number | null
  readonly days: number
  readonly measured: number
}

export function GroupSummary({ securities, metric }: Props) {
  const [correlation, setCorrelation] = useState<Correlation | null>(null)

  const tickers = securities.map((s) => s.ticker).join(',')
  useEffect(() => {
    let live = true
    setCorrelation(null)
    const list = tickers ? tickers.split(',') : []
    // One name has nothing to correlate with. Say so rather than leaving the
    // cell reading "loading" for the rest of the session.
    if (list.length < 2) {
      setCorrelation({ average: null, days: 0, measured: list.length })
      return
    }
    loadSeriesMany(list).then((files) => {
      if (!live) return
      const map = new Map([...files].map(([t, f]) => [t, f.closes] as const))
      const { returns, days } = synchronisedReturns(map)
      setCorrelation({
        average: days >= 20 ? averageCorrelation(correlationMatrix(returns)) : null,
        days,
        measured: map.size,
      })
    })
    return () => {
      live = false
    }
  }, [tickers])

  if (securities.length === 0) return null

  const values = securities.map((s) => ({ id: s.ticker, value: metric.value(s) }))
  const stats = summarise(values)
  const vols = summarise(securities.map((s) => ({ id: s.ticker, value: s.volatility['1Y'] ?? null })))
  const sectors = sectorConcentration(securities.map((s) => s.sector))
  const leading = sectors.bySector[0]

  const measured = Math.max(1, stats.measured)
  const isReturn = metric.id !== 'volatility' && metric.id !== 'beta' && metric.id !== 'market-cap'
  const show = (v: number | null) => (v === null ? EMPTY : metric.format(v))
  // A spread is a distance, not a change, so it carries no sign: an
  // interquartile range of "+216%" would read as a gain.
  const showSpread = (v: number | null) =>
    v === null ? EMPTY : metric.format(Math.abs(v)).replace(/^[+−-]/, '')

  return (
    <div className="summary-grid">
      <div className="summary-cell">
        <div className="summary-label">Advancing</div>
        <div className="summary-value num">
          {stats.advancers} <span className="faint">/ {stats.decliners}</span>
        </div>
        <div className="split" aria-hidden>
          <div className="split-up" style={{ width: `${(stats.advancers / measured) * 100}%` }} />
          <div className="split-down" style={{ width: `${(stats.decliners / measured) * 100}%` }} />
        </div>
        <div className="summary-note">by {metric.short}</div>
      </div>

      <div className="summary-cell">
        <div className="summary-label">Median</div>
        <div className={`summary-value num ${tone(isReturn, stats.median)}`}>{show(stats.median)}</div>
        <div className="summary-note">average {show(stats.average)}</div>
      </div>

      <div className="summary-cell">
        <div className="summary-label">Dispersion</div>
        <div className="summary-value num">{showSpread(stats.dispersion)}</div>
        <div className="summary-note">interquartile spread</div>
      </div>

      <div className="summary-cell">
        <div className="summary-label">Best / worst</div>
        <div className="summary-value num" style={{ fontSize: 14 }}>
          {stats.best?.id ?? EMPTY} <span className="faint">/</span> {stats.worst?.id ?? EMPTY}
        </div>
        <div className="summary-note">
          {show(stats.best?.value ?? null)} · {show(stats.worst?.value ?? null)}
        </div>
      </div>

      <div className="summary-cell">
        <div className="summary-label">Avg volatility</div>
        <div className="summary-value num">{percentPlain(vols.average)}</div>
        <div className="summary-note">median {percentPlain(vols.median)}</div>
      </div>

      <div className="summary-cell">
        <div className="summary-label">Correlation</div>
        <div className="summary-value num">
          {correlation === null ? '…' : ratio(correlation.average)}
        </div>
        <div className="summary-note">
          {correlation === null
            ? 'loading series'
            : correlation.measured < 2
              ? 'needs two names'
              : correlation.average === null
                ? 'not enough overlap'
                : `${correlation.days} shared days`}
        </div>
      </div>

      <div className="summary-cell">
        <div className="summary-label">Concentration</div>
        <div className="summary-value num">{ratio(sectors.herfindahl)}</div>
        <div className="summary-note">
          {leading ? `${leading.sector} ${percentPlain(leading.share, 0)}` : EMPTY}
        </div>
      </div>

      <div className="summary-cell">
        <div className="summary-label">Names</div>
        <div className="summary-value num">{stats.count}</div>
        <div className="summary-note">
          {stats.measured === stats.count
            ? 'all measured'
            : `${stats.count - stats.measured} without ${metric.short}`}
        </div>
      </div>
    </div>
  )
}

const tone = (isReturn: boolean, v: number | null) =>
  !isReturn || v === null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''

export { percent }
