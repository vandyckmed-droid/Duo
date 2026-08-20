import { useState } from 'react'
import type { RankedSecurity } from '../../calc/ranking.ts'
import { concentration } from '../../state/basket.ts'
import { formatScore, formatShare, formatWeight } from '../format.ts'
import type { BasketStore } from '../hooks.ts'

/**
 * The selected basket: ticker, score, sector, weight — sorted by weight.
 *
 * Weights start equal and stay summing to 100% under every edit; the header
 * line makes concentration legible (largest position, share of the top
 * three) without becoming a portfolio analytics dashboard.
 */
export function BasketView({
  store,
  byTicker,
}: {
  store: BasketStore
  byTicker: ReadonlyMap<string, RankedSecurity>
}) {
  if (store.basket.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">Nothing selected</p>
        <p>Tap any row in the ranking to add it to the basket.</p>
      </div>
    )
  }

  const { largest, topShare } = concentration(store.basket)
  const sorted = [...store.basket].sort(
    (a, b) => b.weight - a.weight || (a.ticker < b.ticker ? -1 : 1),
  )

  return (
    <div className="basket">
      <div className="basket-summary">
        <span>
          {store.basket.length} {store.basket.length === 1 ? 'stock' : 'stocks'}
          {store.basket.length > 3 && largest && (
            <> · top 3 hold {formatShare(topShare)} · largest {largest.ticker} {formatShare(largest.weight)}</>
          )}
        </span>
        <button type="button" className="text-button" onClick={store.equalise}>
          Equal weights
        </button>
      </div>
      <ol className="list basket-list">
        {sorted.map((entry) => {
          const row = byTicker.get(entry.ticker)
          return (
            <li key={entry.ticker} className="basket-row">
              <div className="basket-main">
                <div className="row-line">
                  <span className="row-ticker">{entry.ticker}</span>
                  {row && <span className="basket-score">{formatScore(row.score)}</span>}
                </div>
                <div className="row-line">
                  <span className="row-sector basket-sector">
                    {row ? row.security.sector : 'Not in the current universe'}
                  </span>
                </div>
              </div>
              <WeightField weight={entry.weight} onCommit={(w) => store.reweight(entry.ticker, w)} />
              <button
                type="button"
                className="basket-remove"
                aria-label={`Remove ${entry.ticker} from basket`}
                onClick={() => store.remove(entry.ticker)}
              >
                ×
              </button>
            </li>
          )
        })}
      </ol>
      <div className="basket-total">
        <span>Total</span>
        <span className="basket-total-value">100%</span>
      </div>
    </div>
  )
}

/**
 * One editable weight. Text is local while focused and committed on blur or
 * Enter, so renormalisation of every other row does not fight the keyboard.
 */
function WeightField({ weight, onCommit }: { weight: number; onCommit: (w: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft !== null) {
      const parsed = Number.parseFloat(draft.replace(',', '.'))
      if (Number.isFinite(parsed)) onCommit(parsed / 100)
    }
    setDraft(null)
  }

  return (
    <span className="weight">
      <input
        className="weight-input"
        inputMode="decimal"
        aria-label="Portfolio weight, percent"
        value={draft ?? formatWeight(weight).slice(0, -1)}
        onFocus={(e) => {
          setDraft((weight * 100).toFixed(1))
          e.target.select()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      <span className="weight-unit">%</span>
    </span>
  )
}
