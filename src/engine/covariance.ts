import { mean, stdev } from './volatility.ts'
import { TRADING_DAYS_PER_YEAR } from './types.ts'

/**
 * Sample covariance of synchronised daily return rows, annualised.
 */
export function covarianceMatrix(
  returns: readonly (readonly number[])[],
  annualised = true,
): number[][] {
  const n = returns.length
  const days = returns[0]?.length ?? 0
  const scale = annualised ? TRADING_DAYS_PER_YEAR : 1
  const means = returns.map((r) => mean(r))
  const m: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  if (days < 2) return m

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let acc = 0
      const ri = returns[i] as readonly number[]
      const rj = returns[j] as readonly number[]
      for (let k = 0; k < days; k++) {
        acc += ((ri[k] as number) - (means[i] as number)) * ((rj[k] as number) - (means[j] as number))
      }
      const v = (acc / (days - 1)) * scale
      ;(m[i] as number[])[j] = v
      ;(m[j] as number[])[i] = v
    }
  }
  return m
}

/**
 * Ledoit–Wolf-style shrinkage towards a constant-correlation target.
 *
 * A sample covariance estimated from a few hundred days across a few dozen
 * names is badly conditioned: its smallest eigenvalues are mostly estimation
 * error, and an optimiser will find them and pile into whatever pair looks
 * most spuriously offsetting. Shrinking the correlations towards their common
 * average keeps each name's own variance intact while pulling the pairwise
 * structure back towards something the sample can actually support.
 *
 * `intensity` of 0 leaves the sample matrix alone, 1 replaces every
 * correlation with the average. The default is a deliberately mild, fixed
 * amount rather than an estimated optimum — an estimated shrinkage constant
 * would be one more opaque number in a layer that promises not to have any.
 */
export function shrinkCovariance(sample: readonly (readonly number[])[], intensity = 0.2): number[][] {
  const n = sample.length
  if (n === 0) return []
  const clamped = Math.max(0, Math.min(1, intensity))
  const sd = Array.from({ length: n }, (_, i) =>
    Math.sqrt(Math.max(0, (sample[i] as readonly number[])[i] as number)),
  )

  let sum = 0
  let count = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const denom = (sd[i] as number) * (sd[j] as number)
      if (denom <= 1e-18) continue
      sum += ((sample[i] as readonly number[])[j] as number) / denom
      count++
    }
  }
  const meanCorrelation = count ? sum / count : 0

  const out: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  for (let i = 0; i < n; i++) {
    ;(out[i] as number[])[i] = (sample[i] as readonly number[])[i] as number
    for (let j = i + 1; j < n; j++) {
      const denom = (sd[i] as number) * (sd[j] as number)
      const sampleCorr = denom <= 1e-18 ? 0 : ((sample[i] as readonly number[])[j] as number) / denom
      const shrunk = (1 - clamped) * sampleCorr + clamped * meanCorrelation
      const v = shrunk * denom
      ;(out[i] as number[])[j] = v
      ;(out[j] as number[])[i] = v
    }
  }
  return out
}

/** Volatility of a weighted combination: √(wᵀΣw). */
export function portfolioVolatility(
  weights: readonly number[],
  covariance: readonly (readonly number[])[],
): number {
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      acc += (weights[i] as number) * (weights[j] as number) * ((covariance[i] as readonly number[])[j] as number)
    }
  }
  return Math.sqrt(Math.max(0, acc))
}

/**
 * Each holding's share of total portfolio risk (marginal contribution × weight,
 * normalised). Answers "where is the risk actually coming from?", which a
 * weight column on its own cannot.
 */
export function riskContributions(
  weights: readonly number[],
  covariance: readonly (readonly number[])[],
): number[] {
  const vol = portfolioVolatility(weights, covariance)
  if (vol <= 1e-12) return weights.map(() => 0)
  return weights.map((w, i) => {
    let marginal = 0
    for (let j = 0; j < weights.length; j++) {
      marginal += (weights[j] as number) * ((covariance[i] as readonly number[])[j] as number)
    }
    return (w * marginal) / (vol * vol)
  })
}

/** Correlation matrix derived from a covariance matrix. */
export function toCorrelation(covariance: readonly (readonly number[])[]): number[][] {
  const n = covariance.length
  const sd = Array.from({ length: n }, (_, i) =>
    Math.sqrt(Math.max(0, (covariance[i] as readonly number[])[i] as number)),
  )
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const denom = (sd[i] as number) * (sd[j] as number)
      if (denom <= 1e-18) return i === j ? 1 : 0
      return ((covariance[i] as readonly number[])[j] as number) / denom
    }),
  )
}

export { stdev }
