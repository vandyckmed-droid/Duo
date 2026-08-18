/** An ordinary-least-squares fit of `y` on `x`. */
export interface LinearFit {
  /** Change in `y` per unit change in `x`. */
  readonly slope: number
  /** Value of `y` where `x` is zero. */
  readonly intercept: number
  /** Number of point pairs the fit was computed from. */
  readonly sampleSize: number
}

/**
 * Fits `y = intercept + slope · x` by ordinary least squares.
 *
 * Deliberately knows nothing about prices, returns or markets: it takes two
 * number series and returns a line. Beta is one caller of this; a later
 * factor regression, a trend fit or a rank-vs-time slope are others, and
 * none of them should have to reimplement the arithmetic.
 *
 * Returns `null` rather than a `NaN`-filled fit when the inputs cannot
 * support one: different lengths, fewer than two pairs, a non-finite value,
 * or an `x` series with no variance (a vertical fit, where slope is
 * undefined).
 */
export function fitLine(
  x: readonly number[],
  y: readonly number[],
): LinearFit | null {
  if (x.length !== y.length || x.length < 2) {
    return null
  }
  if (!x.every(Number.isFinite) || !y.every(Number.isFinite)) {
    return null
  }

  const sampleSize = x.length
  const meanX = x.reduce((total, value) => total + value, 0) / sampleSize
  const meanY = y.reduce((total, value) => total + value, 0) / sampleSize

  let covariance = 0
  let varianceX = 0

  for (let index = 0; index < sampleSize; index++) {
    const deviationX = x[index] - meanX
    covariance += deviationX * (y[index] - meanY)
    varianceX += deviationX * deviationX
  }

  if (varianceX === 0 || !Number.isFinite(covariance / varianceX)) {
    return null
  }

  const slope = covariance / varianceX

  return { slope, intercept: meanY - slope * meanX, sampleSize }
}
