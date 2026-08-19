/** A selected stock's volatility, the only input the weighting needs. */
export interface VolatilityInput {
  readonly ticker: string
  readonly volatility: number | null
}

/** A selected stock's resulting weight, or the reason it has none. */
export interface WeightedSelection {
  readonly ticker: string
  /** Fraction of the portfolio (sums to 1 across a selection), or `null`. */
  readonly weight: number | null
}

/**
 * Inverse-volatility weights for a selection: each stock's share is
 * proportional to 1 / volatility, so the least volatile names carry the most
 * weight.
 *
 * A stock with no usable volatility — too little history to measure, or a
 * non-positive value that would make it dominate or break the maths — is
 * excluded from the normalization rather than assigned an arbitrary weight.
 * It still gets a row in the result, with `weight: null`, so the caller can
 * show it as part of the selection without silently dropping it.
 */
export function calculateInverseVolatilityWeights(
  selections: readonly VolatilityInput[],
): readonly WeightedSelection[] {
  const inverse = selections.map((s) => ({
    ticker: s.ticker,
    inverseVolatility: isUsable(s.volatility) ? 1 / s.volatility : null,
  }))

  const total = inverse.reduce((sum, s) => sum + (s.inverseVolatility ?? 0), 0)

  return inverse.map((s) => ({
    ticker: s.ticker,
    weight:
      s.inverseVolatility === null || total <= 0
        ? null
        : s.inverseVolatility / total,
  }))
}

function isUsable(volatility: number | null): volatility is number {
  return volatility !== null && Number.isFinite(volatility) && volatility > 0
}

/**
 * Formats a weight as a percentage, dropping the decimal once it rounds to
 * 100% — the same convention the metric columns use, so a weight reads
 * consistently with everything else on the page.
 */
export function formatWeight(weight: number): string {
  const pct = weight * 100
  const digits = pct >= 99.95 ? 0 : 1
  return `${pct.toFixed(digits)}%`
}
