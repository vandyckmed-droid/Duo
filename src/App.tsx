import { useMemo } from 'react'
import {
  BENCHMARK_HISTORY,
  LAST_TRADING_DATE,
  PRICE_HISTORY,
  STOCKS,
} from './data/index.ts'
import { ACTIVE_METRIC, rankStocks } from './metrics/index.ts'
import { StockList } from './ui/StockList.tsx'

function App() {
  const ranked = useMemo(
    () =>
      rankStocks(STOCKS, ACTIVE_METRIC, {
        priceHistory: PRICE_HISTORY,
        benchmarkHistory: BENCHMARK_HISTORY,
      }),
    [],
  )

  return (
    <main>
      <header className="masthead">
        <h1>Duo</h1>
        {/* The variable is labelled rather than assumed, because it changes. */}
        <span className="masthead-metric">{ACTIVE_METRIC.label}</span>
      </header>

      <StockList stocks={ranked} />

      <footer className="colophon">
        Adjusted closes through {LAST_TRADING_DATE}
      </footer>
    </main>
  )
}

export default App
