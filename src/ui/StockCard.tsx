import type { RankedStock } from '../metrics/index.ts'
import { Logo } from './Logo.tsx'

interface StockCardProps {
  readonly ranked: RankedStock
}

/**
 * One card: Logo · Ticker · Variable.
 *
 * The card knows nothing about which variable it is showing — it renders
 * whatever `display` the ranking produced. That is what keeps a metric swap
 * from reaching the presentation layer.
 */
export function StockCard({ ranked }: StockCardProps) {
  const { stock, display } = ranked

  return (
    <li className="card">
      <Logo logo={stock.logo} name={stock.name} ticker={stock.ticker} />
      <span className="card-ticker">{stock.ticker}</span>
      <span className="card-value">{display}</span>
    </li>
  )
}
