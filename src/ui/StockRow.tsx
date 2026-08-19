import type { Metric } from '../metrics/index.ts'
import type { Ranked } from '../metrics/rank.ts'
import { formatWeight } from '../portfolio/index.ts'
import { CompanyMark } from './CompanyMark.tsx'

/**
 * One stock in the ranking.
 *
 * Ticker and mark are fixed: they identify the row and never change with the
 * sort. The metric cells are generated from the registry, so a new metric
 * appears here without this component changing — only the active one is
 * emphasized, and the rest stay legible but recede.
 *
 * The row itself is the selection control — no checkbox or star is added to
 * every row for the sake of the few that are selected. Selection state
 * shows as an inverted row, so it reads at a glance without a permanent
 * extra element competing with the ranking.
 */
export function StockRow({
  entry,
  metrics,
  activeMetricId,
  hiddenWhenNarrowId,
  selected,
  weight,
  onToggle,
}: {
  readonly entry: Ranked
  readonly metrics: readonly Metric[]
  readonly activeMetricId: string
  readonly hiddenWhenNarrowId: string | null
  readonly selected: boolean
  /** This stock's portfolio weight, `null` if excluded, `undefined` if not selected. */
  readonly weight: number | null | undefined
  readonly onToggle: (ticker: string) => void
}) {
  const { rank, stock, values } = entry

  const toggle = () => onToggle(stock.ticker)
  const handleKeyDown = (event: React.KeyboardEvent<HTMLLIElement>) => {
    // Space and Enter activate a button by convention; the row plays that
    // role, so it honours both rather than only the Enter a <li> gets for free.
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle()
    }
  }

  return (
    <li
      className={selected ? 'row row-selected' : 'row'}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={toggle}
      onKeyDown={handleKeyDown}
    >
      <span className="rank">{rank ?? '–'}</span>
      <CompanyMark ticker={stock.ticker} />

      <span className="identity">
        <span className="ticker">
          {stock.ticker}
          {weight !== undefined && (
            <span className="weight">
              {weight === null ? 'excl.' : formatWeight(weight)}
            </span>
          )}
        </span>
        <span className="name">{stock.name}</span>
      </span>

      {metrics.map((metric) => {
        const value = values[metric.id]
        const classes = ['value']
        if (metric.id === activeMetricId) classes.push('value-active')
        if (metric.id === hiddenWhenNarrowId) classes.push('value-hidden-narrow')
        return (
          <span key={metric.id} className={classes.join(' ')}>
            {value === null ? '–' : metric.format(value)}
          </span>
        )
      })}
    </li>
  )
}
