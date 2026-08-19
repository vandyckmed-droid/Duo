import { rank as rankBy, rankChange } from '../engine/ranking.ts'
import type { SecurityRecord } from './dataset.ts'
import { METRICS, metric } from './metrics.ts'
import type { Segment } from './segments.ts'

/**
 * The ranking engine.
 *
 * Filter, then rank, then present. It runs over the whole published universe
 * in a few milliseconds, so every control on the list — metric, segment,
 * sector, watchlist, direction — is a local recomputation and never a request.
 * Browsing does not touch the network at all.
 *
 * The watchlist is ranked by exactly this function with exactly these metrics.
 * There is no separate watchlist ranking, because a watchlist that ranked
 * differently from the list it was built from would be a second product.
 */

export interface Screen {
  readonly metricId: string
  /** `null` means all three segments. */
  readonly segment: Segment | null
  /** `null` means every sector. */
  readonly sector: string | null
  /** Restrict to the watchlist. */
  readonly watchlistOnly: boolean
  /** Flip the metric's natural direction. */
  readonly invert: boolean
  readonly query: string
}

export interface Row {
  readonly security: SecurityRecord
  readonly rank: number
  /** The active metric's value, already the thing the row displays large. */
  readonly value: number | null
  /** Positions climbed over the rank-change window, within this same list. */
  readonly change: number | null
}

export interface ScreenResult {
  readonly rows: readonly Row[]
  /** In the filter, but with no value for the active metric. */
  readonly unranked: readonly Row[]
  readonly total: number
}

export const DEFAULT_SCREEN: Screen = {
  metricId: METRICS[0]?.id ?? '12-1',
  segment: null,
  sector: null,
  watchlistOnly: false,
  invert: false,
  query: '',
}

export function filter(
  securities: readonly SecurityRecord[],
  screen: Screen,
  watchlist: ReadonlySet<string>,
): SecurityRecord[] {
  const query = screen.query.trim().toUpperCase()
  return securities.filter((s) => {
    if (screen.segment && s.segment !== screen.segment) return false
    if (screen.sector && s.sector !== screen.sector) return false
    if (screen.watchlistOnly && !watchlist.has(s.ticker)) return false
    if (query && !s.ticker.includes(query) && !s.name.toUpperCase().includes(query)) return false
    return true
  })
}

export function screen(
  securities: readonly SecurityRecord[],
  view: Screen,
  watchlist: ReadonlySet<string>,
): ScreenResult {
  const pool = filter(securities, view, watchlist)
  const active = metric(view.metricId)
  const identify = (s: SecurityRecord) => s.ticker

  // Rank change is always measured in the ranking named by `basedOn` — for the
  // rank-change metric itself, and as the secondary "Δ" shown alongside every
  // other metric. Both rankings are built over the *filtered* pool, so a rank
  // always means "position in the list on screen" and the change means
  // "positions moved within that same list".
  const changeBasis = metric(active.basedOn ?? active.id)
  const now = rankBy(pool, identify, changeBasis.value, changeBasis.direction)
  const then = rankBy(pool, identify, changeBasis.prior, changeBasis.direction)
  const changes = rankChange(then.rankOf, now.rankOf)

  const direction =
    active.direction === 'desc'
      ? view.invert
        ? 'asc'
        : 'desc'
      : view.invert
        ? 'desc'
        : 'asc'

  const valueOf =
    active.kind === 'rank-change'
      ? (s: SecurityRecord) => changes.get(s.ticker) ?? null
      : active.value

  const ranked = rankBy(pool, identify, valueOf, direction)

  return {
    rows: ranked.ranked.map((r) => ({
      security: r.item,
      rank: r.rank,
      value: r.value,
      change: changes.get(r.item.ticker) ?? null,
    })),
    unranked: ranked.unranked.map((s) => ({
      security: s,
      rank: 0,
      value: null,
      change: changes.get(s.ticker) ?? null,
    })),
    total: pool.length,
  }
}

/** Sectors present in the universe, for the sector filter. */
export function sectorsOf(securities: readonly SecurityRecord[]): string[] {
  return [...new Set(securities.map((s) => s.sector).filter(Boolean))].sort()
}
