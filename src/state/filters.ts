import type { RankedSecurity } from '../calc/ranking.ts'
import type { Segment } from '../domain/segments.ts'

/**
 * The V1 filters: search, sector, size. Filtering never re-ranks — a row
 * keeps its universe-wide rank so a filtered list reads as a slice of the
 * whole ranking, not a new one.
 */

export interface Filters {
  readonly query: string
  readonly sector: string | 'all'
  readonly segment: Segment | 'all'
}

export const NO_FILTERS: Filters = { query: '', sector: 'all', segment: 'all' }

export function applyFilters<T extends RankedSecurity>(
  rows: readonly T[],
  filters: Filters,
): T[] {
  const query = filters.query.trim().toLowerCase()
  return rows.filter(({ security }) => {
    if (filters.segment !== 'all' && security.segment !== filters.segment) return false
    if (filters.sector !== 'all' && security.sector !== filters.sector) return false
    if (!query) return true
    return (
      security.ticker.toLowerCase().startsWith(query) ||
      security.name.toLowerCase().includes(query)
    )
  })
}

/** The sectors actually present, for the filter control. */
export function sectorsOf(rows: readonly RankedSecurity[]): string[] {
  return [...new Set(rows.map((r) => r.security.sector))].sort()
}
