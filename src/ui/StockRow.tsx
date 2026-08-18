import type { Metric } from '../metrics/index.ts'
import type { Ranked } from '../metrics/rank.ts'
import { CompanyMark } from './CompanyMark.tsx'

/**
 * One stock in the ranking.
 *
 * Ticker and mark are fixed: they identify the row and never change with the
 * sort. The metric cells are generated from the registry, so a new metric
 * appears here without this component changing — only the active one is
 * emphasized, and the rest stay legible but recede.
 */
export function StockRow({
  entry,
  metrics,
  activeMetricId,
}: {
  readonly entry: Ranked
  readonly metrics: readonly Metric[]
  readonly activeMetricId: string
}) {
  const { rank, stock, values } = entry

  return (
    <li className="row">
      <span className="rank">{rank ?? '–'}</span>
      <CompanyMark ticker={stock.ticker} />

      <span className="identity">
        <span className="ticker">{stock.ticker}</span>
        <span className="name">{stock.name}</span>
      </span>

      {metrics.map((metric) => {
        const value = values[metric.id]
        return (
          <span
            key={metric.id}
            className={
              metric.id === activeMetricId ? 'value value-active' : 'value'
            }
          >
            {value === null ? '–' : metric.format(value)}
          </span>
        )
      })}
    </li>
  )
}
