import type { PriceSeries } from '../data/types.ts'
import { calculateRawReturn } from './rawReturn.ts'
import { closeAtOrBefore } from './seriesLookup.ts'
import type { MonthWindow } from './windowedReturn.ts'
import { resolveWindow } from './windowedReturn.ts'

/**
 * Fewest paired daily observations worth fitting a line through. A beta from
 * a few weeks of overlap is a number, not an estimate, and it would place a
 * barely-listed stock confidently in the middle of the ranking.
 */
const MIN_PAIRED_RETURNS = 200

/** Daily returns for an asset and a benchmark over identical intervals. */
export interface AlignedReturns {
  readonly asset: readonly number[]
  readonly benchmark: readonly number[]
}

/**
 * Daily returns for two series, paired over the same calendar intervals.
 *
 * Prices are aligned *before* returns are taken: only dates where both series
 * have a usable close contribute, and each return spans consecutive surviving
 * dates. Taking returns first and pairing afterwards would put an asset's
 * two-day return (across a halt) opposite the benchmark's one-day return, and
 * a mismatched interval inflates the fitted relationship rather than breaking
 * it visibly.
 */
export function alignedDailyReturns(
  asset: PriceSeries,
  benchmark: PriceSeries,
  fromIndex = 0,
  toIndex = asset.closes.length - 1,
): AlignedReturns {
  const assetReturns: number[] = []
  const benchmarkReturns: number[] = []

  let previousAsset: number | null = null
  let previousBenchmark: number | null = null

  const end = Math.min(toIndex, asset.closes.length - 1, benchmark.closes.length - 1)
  for (let i = Math.max(fromIndex, 0); i <= end; i++) {
    const a = asset.closes[i]
    const b = benchmark.closes[i]
    if (!usable(a) || !usable(b)) {
      continue
    }
    if (previousAsset !== null && previousBenchmark !== null) {
      assetReturns.push(a / previousAsset - 1)
      benchmarkReturns.push(b / previousBenchmark - 1)
    }
    previousAsset = a
    previousBenchmark = b
  }

  return { asset: assetReturns, benchmark: benchmarkReturns }
}

function usable(close: number | null): close is number {
  return close !== null && Number.isFinite(close) && close > 0
}

/**
 * Ordinary least squares slope of `asset` regressed on `benchmark`, with an
 * intercept fitted — the market beta.
 *
 * The intercept is fitted rather than forced through the origin so the slope
 * is not distorted by an asset's average drift; it is then discarded, because
 * that drift is the stock-specific performance the residual metric exists to
 * measure.
 *
 * Returns `null` when there are too few paired observations, or when the
 * benchmark did not vary enough for a slope to mean anything.
 */
export function estimateBeta(returns: AlignedReturns): number | null {
  const n = returns.asset.length
  if (n < MIN_PAIRED_RETURNS || n !== returns.benchmark.length) {
    return null
  }

  const meanAsset = mean(returns.asset)
  const meanBenchmark = mean(returns.benchmark)

  let covariance = 0
  let variance = 0
  for (let i = 0; i < n; i++) {
    const dx = returns.benchmark[i] - meanBenchmark
    covariance += dx * (returns.asset[i] - meanAsset)
    variance += dx * dx
  }

  return variance > 0 ? covariance / variance : null
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Return over `window` with the benchmark's move, scaled by beta, removed:
 *
 *   residual = assetReturn − beta × benchmarkReturn
 *
 * Beta is estimated over the series' full history rather than over `window`,
 * because a slope fitted to a single year of overlap is unstable enough to
 * come back negative; a three-year fit does not. The window still sets the
 * period being measured, so this number stays comparable with the other
 * metrics on the row.
 *
 * The fitted intercept is deliberately not subtracted. Alpha *is* persistent
 * stock-specific outperformance, so removing it would strip out the signal
 * and leave the ranking measuring noise.
 *
 * Returns `null` when beta cannot be estimated, or when either series cannot
 * cover the window.
 */
export function calculateResidualReturn(
  asset: PriceSeries,
  benchmark: PriceSeries,
  window: MonthWindow,
): number | null {
  const beta = estimateBeta(alignedDailyReturns(asset, benchmark))
  if (beta === null) {
    return null
  }

  const resolved = resolveWindow(asset, window)
  if (resolved === null) {
    return null
  }

  const assetReturn = calculateRawReturn(resolved.startClose, resolved.endClose)
  if (assetReturn === null) {
    return null
  }

  // The benchmark is measured over the asset's window, so both returns span
  // the same period even when the asset's calendar has gaps.
  const benchmarkStart = closeAtOrBefore(benchmark, resolved.startIndex)
  const benchmarkEnd = closeAtOrBefore(benchmark, resolved.endIndex)
  if (benchmarkStart === null || benchmarkEnd === null) {
    return null
  }

  const benchmarkReturn = calculateRawReturn(benchmarkStart, benchmarkEnd)
  if (benchmarkReturn === null) {
    return null
  }

  return assetReturn - beta * benchmarkReturn
}
