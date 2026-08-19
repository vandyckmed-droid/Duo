import { useEffect, useMemo, useState } from 'react'
import type { SecurityRecord } from '../domain/dataset.ts'
import { loadSeriesMany } from '../data/dataset.ts'
import { allocate, type Allocation, type Scheme } from '../engine/index.ts'
import { percentPlain, ratio } from '../domain/format.ts'

/**
 * Portfolio construction over the watchlist.
 *
 * Three schemes, in increasing order of how much they claim to know:
 *
 *  - **Equal** assumes nothing.
 *  - **Inverse volatility** assumes only that a louder name should be a
 *    smaller position.
 *  - **HRP** additionally uses how the names move together, clustering them by
 *    correlation and splitting capital down the tree.
 *
 * Weights alone do not explain a portfolio, so risk contribution is shown
 * beside every weight: two 10% positions can carry very different amounts of
 * the total risk, and that is usually the thing worth knowing. Caps that
 * cannot be met are stated in full rather than quietly approximated.
 */

const SCHEMES: { id: Scheme; label: string; blurb: string }[] = [
  { id: 'equal', label: 'Equal', blurb: 'Every holding the same weight. Assumes nothing about risk.' },
  {
    id: 'inverse-vol',
    label: 'Inverse vol',
    blurb: 'Weight ∝ 1 / annualised volatility, normalised. Louder names get smaller positions.',
  },
  {
    id: 'hrp',
    label: 'HRP',
    blurb:
      'Hierarchical risk parity: correlations become distances, names cluster bottom-up, and capital splits down the tree in inverse proportion to each branch’s risk. No matrix is inverted.',
  },
]

const CAPS = [null, 0.25, 0.15, 0.1] as const

interface Props {
  readonly securities: readonly SecurityRecord[]
  readonly scheme: Scheme
  readonly capPerHolding: number | null
  readonly capPerSector: number | null
  readonly onChange: (patch: {
    scheme?: Scheme
    capPerHolding?: number | null
    capPerSector?: number | null
  }) => void
  readonly onOpen: (ticker: string) => void
}

export function PortfolioView({
  securities,
  scheme,
  capPerHolding,
  capPerSector,
  onChange,
  onOpen,
}: Props) {
  const [series, setSeries] = useState<Map<string, (number | null)[]> | null>(null)

  const tickers = securities.map((s) => s.ticker).join(',')
  useEffect(() => {
    let live = true
    setSeries(null)
    const list = tickers ? tickers.split(',') : []
    if (list.length === 0) {
      setSeries(new Map())
      return
    }
    loadSeriesMany(list).then((files) => {
      if (!live) return
      setSeries(new Map([...files].map(([t, f]) => [t, f.closes as (number | null)[]])))
    })
    return () => {
      live = false
    }
  }, [tickers])

  const allocation: Allocation | null = useMemo(() => {
    if (!series) return null
    return allocate(
      securities.map((s) => ({ id: s.ticker, group: s.sector })),
      series,
      scheme,
      {
        ...(capPerHolding !== null ? { perHolding: capPerHolding } : {}),
        ...(capPerSector !== null ? { perGroup: capPerSector } : {}),
      },
    )
  }, [series, securities, scheme, capPerHolding, capPerSector])

  const blurb = SCHEMES.find((s) => s.id === scheme)?.blurb ?? ''

  if (securities.length === 0) {
    return (
      <div className="scroll">
        <p className="empty">
          Add names to the watchlist and they become the candidate set here.
        </p>
      </div>
    )
  }

  const maxWeight = Math.max(0.0001, ...(allocation?.weights.map((w) => w.weight) ?? [1]))

  return (
    <div className="scroll">
      <div className="choices" role="group" aria-label="Weighting scheme">
        {SCHEMES.map((s) => (
          <button key={s.id} aria-pressed={scheme === s.id} onClick={() => onChange({ scheme: s.id })}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="prose" style={{ paddingBottom: 12 }}>
        {blurb}
      </p>

      <div className="cap-line">
        <span className="cap-label">Name cap</span>
        <div className="choices" role="group" aria-label="Maximum weight per holding">
          {CAPS.map((cap) => (
            <button
              key={String(cap)}
              aria-pressed={capPerHolding === cap}
              onClick={() => onChange({ capPerHolding: cap })}
            >
              {cap === null ? 'None' : percentPlain(cap, 0)}
            </button>
          ))}
        </div>
      </div>
      <div className="cap-line">
        <span className="cap-label">Sector cap</span>
        <div className="choices" role="group" aria-label="Maximum weight per sector">
          {CAPS.map((cap) => (
            <button
              key={String(cap)}
              aria-pressed={capPerSector === cap}
              onClick={() => onChange({ capPerSector: cap })}
            >
              {cap === null ? 'None' : percentPlain(cap, 0)}
            </button>
          ))}
        </div>
      </div>

      {allocation === null ? (
        <div className="loading" style={{ height: 120 }}>
          Loading price history…
        </div>
      ) : (
        <>
          {allocation.warnings.map((warning) => (
            <p className="notice" key={warning}>
              {warning}
            </p>
          ))}

          <div className="summary-grid">
            <div className="summary-cell">
              <div className="summary-label">Portfolio vol</div>
              <div className="summary-value num">{percentPlain(allocation.portfolioVolatility)}</div>
              <div className="summary-note">annualised</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Concentration</div>
              <div className="summary-value num">{ratio(allocation.concentration)}</div>
              <div className="summary-note">
                effective names {ratio(allocation.concentration > 0 ? 1 / allocation.concentration : null, 1)}
              </div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Holdings</div>
              <div className="summary-value num">{allocation.weights.length}</div>
              <div className="summary-note">{allocation.days} shared days</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Largest</div>
              <div className="summary-value num">
                {percentPlain(Math.max(0, ...allocation.weights.map((w) => w.weight)))}
              </div>
              <div className="summary-note">single position</div>
            </div>
          </div>

          <div className="section" style={{ padding: '18px 0 0' }}>
            <h2 className="section-title" style={{ padding: '0 16px 8px' }}>
              Weight · share of risk
            </h2>
            {[...allocation.weights]
              .sort((a, b) => b.weight - a.weight)
              .map((w) => (
                <button
                  className="bar-row"
                  key={w.id}
                  style={{ width: '100%' }}
                  onClick={() => onOpen(w.id)}
                >
                  <span className="bar-id">
                    <b>{w.id}</b>
                    <small className="num">{percentPlain(w.volatility, 0)} vol</small>
                  </span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(w.weight / maxWeight) * 100}%` }} />
                  </span>
                  <span className="bar-value num">{percentPlain(w.weight)}</span>
                  <span className="bar-note num">
                    {percentPlain(w.riskContribution, 0)} risk
                  </span>
                </button>
              ))}
          </div>

          {allocation.excluded.length > 0 && (
            <div className="section">
              <h2 className="section-title">Excluded</h2>
              {allocation.excluded.map((e) => (
                <div className="stat-row" key={e.id}>
                  <span className="stat-label">{e.id}</span>
                  <span className="stat-value dim" style={{ fontWeight: 500 }}>
                    {e.reason}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="prose" style={{ padding: '18px 16px 40px' }}>
            Risk contribution is each holding’s share of total portfolio variance —
            weight × marginal contribution, normalised so the column sums to 100%. A
            position can be small and still be most of the risk. Volatility and
            correlation are estimated from {allocation.days} synchronised trading days
            with shrinkage applied to the covariance matrix.
          </p>
        </>
      )}
    </div>
  )
}
