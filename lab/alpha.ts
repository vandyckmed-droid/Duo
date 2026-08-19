/**
 * The challenger Alpha Score.
 *
 * V2's composite estimate of cross-sectional attractiveness. It does not
 * forecast a return; it orders today's universe by how many independent
 * families of evidence support each name and how strongly.
 *
 * Status: **challenger**. Nothing in the V1 interface reads this by default,
 * and per docs/V2-DIRECTIVE.md it cannot become a default without validated
 * out-of-sample evidence and explicit owner approval. It exists so the Alpha
 * Lab and the challenger view can measure it against V1's single-metric
 * rankings.
 *
 * Construction, in order:
 *
 *  1. Every underlying signal becomes a percentile of today's universe
 *     (crossSection.ts) — that is the normalisation *and* the winsorization.
 *  2. Percentiles condense into family scores by equal-weighted mean.
 *  3. Family scores combine using the declared research-prior weights.
 *     A family with no value for a name is dropped and the remaining weights
 *     renormalised — missing data thins the evidence, it never fakes a value.
 *  4. A name needs at least two present families to receive a score at all.
 *
 * Weights are research priors from the directive, deliberately round and
 * deliberately slow-moving. The fundamental and quality families are not yet
 * built (their data was only just probed); their weights sit in the table so
 * that adding the family is adding its score, not rebalancing everything.
 */

export const FAMILY_WEIGHTS = {
  price: 30,
  residual: 25,
  fundamental: 20,
  trend: 10,
  quality: 10,
  industry: 5,
} as const

export type FamilyId = keyof typeof FAMILY_WEIGHTS

/**
 * Weighted mean of the present families, weights renormalised over presence.
 * Null with fewer than two families — one lens is a metric, not a composite.
 */
export function compositeScore(
  families: Readonly<Record<FamilyId, number | null>>,
): number | null {
  let weight = 0
  let sum = 0
  let present = 0
  for (const [family, value] of Object.entries(families) as [FamilyId, number | null][]) {
    if (value === null) continue
    const w = FAMILY_WEIGHTS[family]
    weight += w
    sum += w * value
    present++
  }
  if (present < 2 || weight === 0) return null
  return sum / weight
}
