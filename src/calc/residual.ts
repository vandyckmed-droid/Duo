import { type Closes, dailyReturns } from './series.ts'

/**
 * Market-residual daily returns, for measuring similarity between stocks.
 *
 *     residual = stock daily return − β × market daily return
 *
 * Two stocks that merely share ordinary market exposure correlate heavily on
 * raw returns; stripping the market term focuses the comparison on
 * stock-specific behaviour. Beta exists only for this measurement — it never
 * touches a momentum score.
 */

/** Fewest same-day return pairs a beta estimate may be formed from. */
export const MIN_BETA_PAIRS = 60

/**
 * OLS beta of a stock's daily returns on the market's, over the trailing
 * `window` trading days ending at the last index. Null when the sample is too
 * small or the market series has no variance to regress against.
 */
export function beta(
  stockCloses: Closes,
  marketCloses: Closes,
  window: number,
  minPairs = MIN_BETA_PAIRS,
): number | null {
  const stock = dailyReturns(stockCloses)
  const market = dailyReturns(marketCloses)
  const to = Math.min(stock.length, market.length) - 1
  const from = Math.max(1, to - window + 1)

  const xs: number[] = []
  const ys: number[] = []
  for (let i = from; i <= to; i++) {
    const x = market[i]
    const y = stock[i]
    if (x !== null && x !== undefined && y !== null && y !== undefined) {
      xs.push(x)
      ys.push(y)
    }
  }
  if (xs.length < minPairs) return null

  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length
  let cov = 0
  let varX = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = (xs[i] as number) - meanX
    cov += dx * ((ys[i] as number) - meanY)
    varX += dx * dx
  }
  if (varX <= 0) return null
  return cov / varX
}

/**
 * Residual daily returns aligned to the calendar, defined only on days where
 * both the stock and the market have a real return inside the trailing
 * `window`. Null everywhere else, and null throughout when beta cannot be
 * estimated — no evidence of similarity is measured as no similarity, never
 * invented.
 */
export function residualReturns(
  stockCloses: Closes,
  marketCloses: Closes,
  window: number,
): (number | null)[] {
  const length = Math.min(stockCloses.length, marketCloses.length)
  const out: (number | null)[] = Array.from({ length }, () => null)
  const b = beta(stockCloses, marketCloses, window)
  if (b === null) return out

  const stock = dailyReturns(stockCloses)
  const market = dailyReturns(marketCloses)
  const from = Math.max(1, length - window)
  for (let i = from; i < length; i++) {
    const y = stock[i]
    const x = market[i]
    if (y !== null && y !== undefined && x !== null && x !== undefined) {
      out[i] = y - b * x
    }
  }
  return out
}
