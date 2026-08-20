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
 * Pearson correlation of two aligned nullable series, over the indices where
 * both have a value. Null below `minOverlap` shared observations — a
 * correlation from a handful of days is noise wearing a statistic's name —
 * or when either side has no variance.
 */
export function correlation(
  a: readonly (number | null)[],
  b: readonly (number | null)[],
  minOverlap: number,
): number | null {
  const xs: number[] = []
  const ys: number[] = []
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const x = a[i]
    const y = b[i]
    if (x !== null && x !== undefined && y !== null && y !== undefined) {
      xs.push(x)
      ys.push(y)
    }
  }
  if (xs.length < Math.max(2, minOverlap)) return null

  const meanX = mean(xs)
  const meanY = mean(ys)
  let cov = 0
  let varX = 0
  let varY = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = (xs[i] as number) - meanX
    const dy = (ys[i] as number) - meanY
    cov += dx * dy
    varX += dx * dx
    varY += dy * dy
  }
  if (varX <= 0 || varY <= 0) return null
  return cov / Math.sqrt(varX * varY)
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
