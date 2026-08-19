import type { SecurityRecord } from './dataset.ts'
import { GICS_SECTORS } from './sectors.ts'
import { SEGMENTS, type Segment } from './segments.ts'

/**
 * Sector leaders: one name per sector per index.
 *
 * Eleven GICS sectors times three segments is thirty-three slots. Each slot
 * goes to the name whose *average rank* across the plain 12−1 and 6−1 return
 * rankings of that sector-within-segment is best — the two horizons vote as
 * equals, so a name has to look strong on both to lead, and a single
 * spectacular quarter cannot carry it alone. Raw returns only: no residual,
 * no volatility adjustment. Risk enters later, when cash is divided.
 *
 * A slot with no qualifying name (every candidate missing one of the two
 * returns) is reported as empty rather than filled with a weaker measurement.
 */

export interface LeaderSlot {
  readonly segment: Segment
  readonly sector: string
  readonly security: SecurityRecord
  /** Average of the name's 12−1 and 6−1 ranks within this slot's candidates. */
  readonly averageRank: number
  /** How many names competed for the slot. */
  readonly of: number
}

export interface Leaders {
  readonly slots: readonly LeaderSlot[]
  /** Sector × segment combinations with no rankable name. */
  readonly empty: readonly { segment: Segment; sector: string }[]
}

export function sectorLeaders(securities: readonly SecurityRecord[]): Leaders {
  const slots: LeaderSlot[] = []
  const empty: { segment: Segment; sector: string }[] = []

  for (const segment of SEGMENTS) {
    for (const sector of GICS_SECTORS) {
      const candidates = securities.filter(
        (s) =>
          s.segment === segment.id &&
          s.sector === sector &&
          finite(s.returns['12-1']) &&
          finite(s.returns['6-1']),
      )
      if (candidates.length === 0) {
        empty.push({ segment: segment.id, sector })
        continue
      }
      const rank12 = ranksOf(candidates, (s) => s.returns['12-1'] as number)
      const rank6 = ranksOf(candidates, (s) => s.returns['6-1'] as number)
      let best: SecurityRecord | null = null
      let bestAvg = Infinity
      for (const s of candidates) {
        const avg = (((rank12.get(s.ticker) as number) + (rank6.get(s.ticker) as number)) / 2)
        if (
          avg < bestAvg ||
          (avg === bestAvg && best !== null && breaksTie(s, best))
        ) {
          best = s
          bestAvg = avg
        }
      }
      slots.push({
        segment: segment.id,
        sector,
        security: best as SecurityRecord,
        averageRank: bestAvg,
        of: candidates.length,
      })
    }
  }

  return { slots, empty }
}

/** Descending ranks, 1 = best. Ties share the better rank. */
function ranksOf(
  candidates: readonly SecurityRecord[],
  value: (s: SecurityRecord) => number,
): Map<string, number> {
  const sorted = [...candidates].sort((a, b) => value(b) - value(a))
  const ranks = new Map<string, number>()
  sorted.forEach((s, i) => {
    const prev = i > 0 ? (sorted[i - 1] as SecurityRecord) : null
    const rank = prev !== null && value(prev) === value(s)
      ? (ranks.get(prev.ticker) as number)
      : i + 1
    ranks.set(s.ticker, rank)
  })
  return ranks
}

/** Equal average rank: the higher 12−1 return wins, then the earlier ticker. */
function breaksTie(challenger: SecurityRecord, incumbent: SecurityRecord): boolean {
  const c = challenger.returns['12-1'] as number
  const i = incumbent.returns['12-1'] as number
  if (c !== i) return c > i
  return challenger.ticker < incumbent.ticker
}

const finite = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/**
 * Divides a cash total across weights into whole dollars that sum exactly.
 *
 * Floor everything, then hand the leftover dollars to the largest fractional
 * remainders. Rounding each position independently can miss the total by a
 * few dollars in either direction, and a portfolio view whose column does not
 * add up to its own headline number reads as a bug even when it is rounding.
 */
export function cashAmounts(weights: readonly number[], total: number): number[] {
  if (weights.length === 0) return []
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0 || !Number.isFinite(sum) || total <= 0) return weights.map(() => 0)
  const exact = weights.map((w) => (w / sum) * total)
  const floors = exact.map(Math.floor)
  let leftover = Math.round(total - floors.reduce((a, b) => a + b, 0))
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (leftover <= 0) break
    floors[i] = (floors[i] as number) + 1
    leftover--
  }
  return floors
}
