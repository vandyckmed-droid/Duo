/** Cross-sectional statistics used by normalisation. */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  let sum = 0
  for (const x of xs) sum += x
  return sum / xs.length
}

/** Sample standard deviation (n − 1). Null below two points: no spread. */
export function stdev(xs: readonly number[]): number | null {
  if (xs.length < 2) return null
  const average = mean(xs)
  let sq = 0
  for (const x of xs) sq += (x - average) ** 2
  return Math.sqrt(sq / (xs.length - 1))
}

/**
 * Z-scores of a cross-section: each value's distance from the mean in standard
 * deviations. This is what makes a 12−1 signal and a 6−1 signal comparable
 * enough to blend — the raw values live on different scales.
 *
 * A degenerate cross-section (everything identical, or fewer than two values)
 * normalises to all zeros rather than dividing by nothing.
 */
export function zScores(xs: readonly number[]): number[] {
  const sd = stdev(xs)
  if (sd === null || sd <= 0) return xs.map(() => 0)
  const average = mean(xs)
  return xs.map((x) => (x - average) / sd)
}
