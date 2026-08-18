import type { RankedStock } from '../metrics/index.ts'
import { StockCard } from './StockCard.tsx'

interface StockListProps {
  readonly stocks: readonly RankedStock[]
}

/**
 * The ranked cards, top to bottom.
 *
 * An ordered list because the order carries meaning — the ranking is the
 * content, not a styling choice.
 */
export function StockList({ stocks }: StockListProps) {
  return (
    <ol className="cards">
      {stocks.map((ranked) => (
        <StockCard key={ranked.stock.ticker} ranked={ranked} />
      ))}
    </ol>
  )
}
