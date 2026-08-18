/**
 * Raw (non-annualized) price return between two prices.
 *
 * `(endPrice / startPrice) - 1`
 *
 * Takes plain prices, not `PricePoint`s or a ticker — this stays reusable for
 * any pair of prices a future metric wants to compare, independent of the
 * stock's identity or how the prices were sourced.
 *
 * Returns `null` instead of `NaN`/`Infinity` when either price is not a
 * positive finite number, so a bad input can't silently propagate into a
 * ranking or a rendered value.
 */
export function calculateRawReturn(
  startPrice: number,
  endPrice: number,
): number | null {
  if (!isPositiveFinite(startPrice) || !isPositiveFinite(endPrice)) {
    return null
  }

  return endPrice / startPrice - 1
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}
