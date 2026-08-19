import { useEffect, useMemo, useState } from 'react'
import type { SecurityRecord } from '../domain/dataset.ts'
import { loadSeriesMany } from '../data/dataset.ts'
import { allocate, type Allocation, type Scheme } from '../engine/index.ts'
import { cashAmounts, type Leaders } from '../domain/leaders.ts'
import { cash, percentPlain } from '../domain/format.ts'
import { SEGMENTS, type Segment } from '../domain/segments.ts'
import type { PortfolioSource } from '../state/viewState.ts'

/**
 * The portfolio, expressed in cash.
 *
 * Weights are how a portfolio is computed; dollars are how it is bought. So
 * the dollar column is the primary one here and the percentage sits beside it
 * as the explanation. The total is adjustable and the dollars always add to it
 * exactly — the remainder is distributed to the largest fractional positions
 * rather than left as a rounding gap.
 *
 * Two candidate sets:
 *
 *  - **Sector leaders** — the strongest name in each of the eleven GICS
 *    sectors within each of the three indices, thirty-three slots, chosen by
 *    average rank across the plain 12−1 and 6−1 return rankings. No residual,
 *    no volatility adjustment: selection is momentum, full stop.
 *  - **Watchlist** — whatever has been starred.
 *
 * Selection and sizing are deliberately separate questions. Momentum picks the
 * names; risk sizes them. Under inverse volatility a quieter name receives
 * more cash than a louder one, which is the whole reason the two steps are not
 * collapsed into a single score.
 */

const SCHEMES: { id: Scheme; label: string; blurb: string }[] = [
  {
    id: 'inverse-vol',
    label: 'Inverse vol',
    blurb:
      'Cash ∝ 1 / annualised volatility, normalised to the total. The quieter the name, the larger the position.',
  },
  { id: 'equal', label: 'Equal', blurb: 'Every holding the same dollars. Assumes nothing about risk.' },
  {
    id: 'hrp',
    label: 'HRP',
    blurb:
      'Hierarchical risk parity: correlations become distances, names cluster bottom-up, and cash splits down the tree in inverse proportion to each branch’s risk. No matrix is inverted.',
  },
]

const CAPS = [null, 0.25, 0.15, 0.1] as const
const PRESETS = [10_000, 30_000, 100_000] as const

interface Props {
  readonly leaders: Leaders
  readonly watched: readonly SecurityRecord[]
  readonly source: PortfolioSource
  readonly value: number
  readonly scheme: Scheme
  readonly capPerHolding: number | null
  readonly capPerSector: number | null
  readonly onChange: (patch: {
    scheme?: Scheme
    capPerHolding?: number | null
    capPerSector?: number | null
    portfolioSource?: PortfolioSource
    portfolioValue?: number
  }) => void
  readonly onOpen: (ticker: string) => void
}

export function PortfolioView({
  leaders,
  watched,
  source,
  value,
  scheme,
  capPerHolding,
  capPerSector,
  onChange,
  onOpen,
}: Props) {
  const [series, setSeries] = useState<Map<string, (number | null)[]> | null>(null)

  const holdings = useMemo(
    () => (source === 'leaders' ? leaders.slots.map((s) => s.security) : watched),
    [source, leaders, watched],
  )
  /** Slot metadata by ticker, so a row can say which sector it represents. */
  const slotOf = useMemo(
    () => new Map(leaders.slots.map((s) => [s.security.ticker, s])),
    [leaders],
  )

  const tickers = holdings.map((s) => s.ticker).join(',')
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
      holdings.map((s) => ({ id: s.ticker, group: s.sector })),
      series,
      scheme,
      {
        ...(capPerHolding !== null ? { perHolding: capPerHolding } : {}),
        ...(capPerSector !== null ? { perGroup: capPerSector } : {}),
      },
    )
  }, [series, holdings, scheme, capPerHolding, capPerSector])

  /* Dollars are computed once, over the whole allocation, so they add to the
     total exactly regardless of how the rows are later grouped or sorted. */
  const dollars = useMemo(() => {
    if (!allocation) return new Map<string, number>()
    const amounts = cashAmounts(
      allocation.weights.map((w) => w.weight),
      value,
    )
    return new Map(allocation.weights.map((w, i) => [w.id, amounts[i] as number]))
  }, [allocation, value])

  const blurb = SCHEMES.find((s) => s.id === scheme)?.blurb ?? ''
  const byId = useMemo(() => new Map(holdings.map((s) => [s.ticker, s])), [holdings])

  return (
    <div className="scroll">
      <div className="choices" role="group" aria-label="Candidate set">
        <button
          aria-pressed={source === 'leaders'}
          onClick={() => onChange({ portfolioSource: 'leaders' })}
        >
          Sector leaders
        </button>
        <button
          aria-pressed={source === 'watchlist'}
          onClick={() => onChange({ portfolioSource: 'watchlist' })}
        >
          Watchlist
        </button>
      </div>

      <CashLine value={value} onChange={(v) => onChange({ portfolioValue: v })} />

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
          {CAPS.map((c) => (
            <button
              key={String(c)}
              aria-pressed={capPerHolding === c}
              onClick={() => onChange({ capPerHolding: c })}
            >
              {c === null ? 'None' : percentPlain(c, 0)}
            </button>
          ))}
        </div>
      </div>
      <div className="cap-line">
        <span className="cap-label">Sector cap</span>
        <div className="choices" role="group" aria-label="Maximum weight per sector">
          {CAPS.map((c) => (
            <button
              key={String(c)}
              aria-pressed={capPerSector === c}
              onClick={() => onChange({ capPerSector: c })}
            >
              {c === null ? 'None' : percentPlain(c, 0)}
            </button>
          ))}
        </div>
      </div>

      {holdings.length === 0 ? (
        <p className="empty">
          {source === 'watchlist'
            ? 'Nothing on the watchlist yet. Tap the + on any ranked row to add it.'
            : 'No names available to lead a sector.'}
        </p>
      ) : allocation === null ? (
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

          <div className="summary-grid pairs">
            <div className="summary-cell">
              <div className="summary-label">Invested</div>
              <div className="summary-value num">{cash(sum([...dollars.values()]))}</div>
              <div className="summary-note">{allocation.weights.length} positions</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Portfolio vol</div>
              <div className="summary-value num">{percentPlain(allocation.portfolioVolatility)}</div>
              <div className="summary-note">annualised</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Largest</div>
              <div className="summary-value num">
                {cash(Math.max(0, ...dollars.values()))}
              </div>
              <div className="summary-note">
                {percentPlain(Math.max(0, ...allocation.weights.map((w) => w.weight)))} of total
              </div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Smallest</div>
              <div className="summary-value num">
                {cash(Math.min(...(dollars.size ? [...dollars.values()] : [0])))}
              </div>
              <div className="summary-note">{allocation.days} shared days</div>
            </div>
          </div>

          {source === 'leaders'
            ? SEGMENTS.map((segment) => (
                <SegmentBlock
                  key={segment.id}
                  segment={segment.id}
                  title={segment.indexName}
                  rows={allocation.weights
                    .filter((w) => slotOf.get(w.id)?.segment === segment.id)
                    .map((w) => ({
                      id: w.id,
                      note: slotOf.get(w.id)?.sector ?? '',
                      dollars: dollars.get(w.id) ?? 0,
                      weight: w.weight,
                      volatility: w.volatility,
                    }))}
                  total={value}
                  onOpen={onOpen}
                />
              ))
            : (
                <SegmentBlock
                  segment={null}
                  title="Holdings"
                  rows={allocation.weights.map((w) => ({
                    id: w.id,
                    note: byId.get(w.id)?.sector ?? '',
                    dollars: dollars.get(w.id) ?? 0,
                    weight: w.weight,
                    volatility: w.volatility,
                  }))}
                  total={value}
                  onOpen={onOpen}
                />
              )}

          {source === 'leaders' && leaders.empty.length > 0 && (
            <div className="section">
              <h2 className="section-title">Sectors with no leader</h2>
              {leaders.empty.map((e) => (
                <div className="stat-row" key={`${e.segment}-${e.sector}`}>
                  <span className="stat-label">{e.sector}</span>
                  <span className="stat-value dim" style={{ fontWeight: 500 }}>
                    {segmentName(e.segment)}
                  </span>
                </div>
              ))}
            </div>
          )}

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
            {source === 'leaders'
              ? 'Each slot is the name with the best average rank across the plain 12−1 and 6−1 return rankings of its sector within its index — raw returns, no residual and no volatility adjustment. '
              : ''}
            Cash is divided by {scheme === 'equal' ? 'equal split' : scheme === 'hrp' ? 'hierarchical risk parity' : 'inverse volatility'}, then rounded to whole
            dollars so the column adds to {cash(value)} exactly. Volatility and
            correlation come from {allocation.days} synchronised trading days with
            shrinkage applied to the covariance matrix. Nothing here is an
            instruction to trade.
          </p>
        </>
      )}
    </div>
  )
}

/** The adjustable total. Presets for speed, a field for anything else. */
function CashLine({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)

  const commit = (raw: string) => {
    const parsed = Math.round(Number(raw.replace(/[^0-9.]/g, '')))
    setDraft(null)
    if (Number.isFinite(parsed) && parsed >= 1) onChange(Math.min(parsed, 1e9))
  }

  return (
    <div className="cash-line">
      <label className="cash-field">
        <span className="cash-mark">$</span>
        <input
          className="num"
          inputMode="numeric"
          aria-label="Portfolio value in dollars"
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
      </label>
      <div className="choices" role="group" aria-label="Preset totals">
        {PRESETS.map((p) => (
          <button key={p} aria-pressed={value === p} onClick={() => onChange(p)}>
            {p >= 1000 ? `${p / 1000}k` : String(p)}
          </button>
        ))}
      </div>
    </div>
  )
}

interface Row {
  readonly id: string
  readonly note: string
  readonly dollars: number
  readonly weight: number
  readonly volatility: number
}

function SegmentBlock({
  segment,
  title,
  rows,
  total,
  onOpen,
}: {
  segment: Segment | null
  title: string
  rows: readonly Row[]
  total: number
  onOpen: (ticker: string) => void
}) {
  if (rows.length === 0) return null
  const max = Math.max(0.0001, ...rows.map((r) => r.dollars))
  const subtotal = sum(rows.map((r) => r.dollars))

  return (
    <div className="section" style={{ padding: '18px 0 0' }}>
      <h2 className="section-title" style={{ padding: '0 16px 8px' }}>
        <span>{title}</span>
        <span className="num dim" style={{ float: 'right', fontWeight: 620 }}>
          {cash(subtotal)}
          {segment !== null && total > 0 && (
            <span className="faint"> · {percentPlain(subtotal / total, 0)}</span>
          )}
        </span>
      </h2>
      {[...rows]
        .sort((a, b) => b.dollars - a.dollars)
        .map((r) => (
          <button className="bar-row" key={r.id} style={{ width: '100%' }} onClick={() => onOpen(r.id)}>
            <span className="bar-id">
              <b>{r.id}</b>
              <small>{r.note}</small>
            </span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(r.dollars / max) * 100}%` }} />
            </span>
            <span className="bar-value num">{cash(r.dollars)}</span>
            <span className="bar-note num">
              {percentPlain(r.weight)}
              <br />
              <span className="faint">{percentPlain(r.volatility, 0)} vol</span>
            </span>
          </button>
        ))}
    </div>
  )
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

const segmentName = (id: Segment): string =>
  SEGMENTS.find((s) => s.id === id)?.indexName ?? id
