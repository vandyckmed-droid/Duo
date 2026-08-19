import type { SecurityRecord } from './dataset.ts'
import { agreement, groupPercentiles, meanPercentile, percentiles } from './crossSection.ts'

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

export interface AlphaComponents {
  /** Family scores in [0, 1], null where the family could not be measured. */
  readonly families: Readonly<Record<FamilyId, number | null>>
  /** Momentum agreement across horizons, e.g. { count: 3, of: 4 }. */
  readonly agreement: { count: number; of: number } | null
  /** The composite in [0, 1], or null with fewer than two families present. */
  readonly score: number | null
}

/** The horizons whose percentiles constitute the price-momentum family. */
const PRICE_HORIZONS = ['12-1', '6-1', '3M'] as const

/** Horizons counted for momentum agreement (the graded "same story" check). */
const AGREEMENT_HORIZONS = ['12-1', '6-1', '3M', '12M'] as const

/**
 * Computes Alpha Score components for every security in the universe.
 *
 * Cross-sectional by construction: the result is a property of the list, not
 * of any security alone, which is why this lives beside the ranking engine
 * and not in the published dataset. Returns a map by ticker.
 */
export function alphaComponents(
  securities: readonly SecurityRecord[],
): ReadonlyMap<string, AlphaComponents> {
  const entries = (value: (s: SecurityRecord) => number | null | undefined) =>
    securities.map((s) => ({ id: s.ticker, value: value(s) ?? null }))

  // Price momentum: percentiles per horizon, then the equal-weighted mean.
  const horizonP = new Map(
    AGREEMENT_HORIZONS.map((h) => [h, percentiles(entries((s) => s.returns[h])).byId] as const),
  )

  // Residual momentum: V1's transparent segment-benchmark residual.
  const residualP = percentiles(entries((s) => s.residuals['12M'])).byId

  // Trend quality: how the return was earned. Persistence wants a high
  // positive-day share, a LOW top-day concentration, time spent near the
  // high, and a price still near it.
  const posShareP = percentiles(entries((s) => s.path?.positiveDayShare ?? null)).byId
  const concentrationP = percentiles(entries((s) => s.path?.top5Share ?? null), 'asc').byId
  const nearHighP = percentiles(entries((s) => s.path?.timeNearHigh ?? null)).byId
  const closeToHighP = percentiles(entries((s) => s.path?.closeToHigh ?? null)).byId

  // Industry context: the median 12−1 of the industry, as a percentile across
  // industries, inherited by members. Sector context enters at half weight
  // inside the family — the industry is the sharper lens.
  const industryP = groupPercentiles(
    securities.map((s) => ({
      id: s.ticker,
      group: s.industry,
      value: s.returns['12-1'] ?? null,
    })),
  )
  const sectorP = groupPercentiles(
    securities.map((s) => ({
      id: s.ticker,
      group: s.sector,
      value: s.returns['12-1'] ?? null,
    })),
  )

  const out = new Map<string, AlphaComponents>()
  for (const s of securities) {
    const t = s.ticker

    const priceParts = PRICE_HORIZONS.map((h) => horizonP.get(h)?.get(t) ?? null)
    // Two of three horizons must exist: a family asserting "multi-horizon
    // strength" from a single horizon would be mislabelled.
    const price = meanPercentile(priceParts, 2)

    const residual = residualP.get(t) ?? null

    const trend = meanPercentile(
      [
        posShareP.get(t) ?? null,
        concentrationP.get(t) ?? null,
        nearHighP.get(t) ?? null,
        closeToHighP.get(t) ?? null,
      ],
      3,
    )

    const industryPart = industryP.get(t) ?? null
    const sectorPart = sectorP.get(t) ?? null
    const industry =
      industryPart === null && sectorPart === null
        ? null
        : industryPart === null
          ? sectorPart
          : sectorPart === null
            ? industryPart
            : (2 * industryPart + sectorPart) / 3

    const families: Record<FamilyId, number | null> = {
      price,
      residual,
      fundamental: null, // family not yet built — see docs/DATA-AVAILABILITY.md
      trend,
      quality: null, // family not yet built
      industry,
    }

    out.set(t, {
      families,
      agreement: agreement(AGREEMENT_HORIZONS.map((h) => horizonP.get(h)?.get(t) ?? null)),
      score: compositeScore(families),
    })
  }
  return out
}

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
