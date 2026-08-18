import type { PricePoint } from '../data/types.ts'
import { calculateAlignedReturns } from './alignedReturns.ts'
import { fitLine } from './linearRegression.ts'

/**
 * An asset's relationship to the market, from regressing its returns on the
 * benchmark's: `assetReturn = alpha + beta · benchmarkReturn + residual`.
 */
export interface MarketModel {
  /** Sensitivity to the market. 1 moves with it, >1 amplifies, <1 damps. */
  readonly beta: number
  /** Average per-period return not explained by the market. */
  readonly alpha: number
  /** Number of aligned return periods the fit used. */
  readonly sampleSize: number
}

/**
 * Fewest aligned periods that make a beta worth reporting.
 *
 * A regression on a handful of days will happily produce a number, and that
 * number will be noise. Roughly a quarter of daily sessions is the floor
 * here; the caller can raise it for a metric that needs more.
 */
export const MINIMUM_MARKET_MODEL_PERIODS = 60

/**
 * Estimates an asset's market model against a benchmark.
 *
 * Both halves are deliberately generic. The alignment step takes any two
 * price histories, so the "market" can be swapped from SPY to a sector ETF
 * or an equal-weight index without touching this. The fit is a plain OLS
 * line, so what comes back is not just beta: `alpha` and the pairs from
 * `calculateAlignedReturns` are together everything a market-residual
 * metric needs — the residual of any period is
 * `assetReturn - (alpha + beta · benchmarkReturn)`, and compounding those
 * residuals over a window is residual momentum. That metric is not built
 * yet, but nothing here has to change for it to be.
 *
 * Returns `null` when the two histories share too few periods to fit, or
 * when the benchmark did not move at all across them.
 */
export function estimateMarketModel(
  assetPoints: readonly PricePoint[],
  benchmarkPoints: readonly PricePoint[],
  minimumPeriods: number = MINIMUM_MARKET_MODEL_PERIODS,
): MarketModel | null {
  const pairs = calculateAlignedReturns(assetPoints, benchmarkPoints)
  if (pairs.length < minimumPeriods) {
    return null
  }

  const fit = fitLine(
    pairs.map((pair) => pair.benchmarkReturn),
    pairs.map((pair) => pair.assetReturn),
  )
  if (fit === null) {
    return null
  }

  return {
    beta: fit.slope,
    alpha: fit.intercept,
    sampleSize: fit.sampleSize,
  }
}
