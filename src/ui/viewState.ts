/**
 * What the URL hash encodes: which metric is ranked by, and which sector is
 * shown. Both are part of what a link should reproduce, so both live in the
 * hash rather than in component state alone.
 *
 * A hash rather than a query string, and hand-parsed rather than routed: the
 * whole app is one screen with two controls, and a router would be more
 * machinery than the two values are worth.
 */
export interface View {
  /** Metric id, or `''` when the hash does not name one. */
  readonly metricId: string
  /** Sector to filter to, or `null` for the whole index. */
  readonly sector: string | null
}

/** Reads a view out of a location hash, with or without its leading `#`. */
export function parseViewHash(hash: string): View {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return {
    metricId: params.get('metric') ?? '',
    sector: params.get('sector'),
  }
}

/**
 * Renders a view as a location hash.
 *
 * Empty values are left out entirely, so the default view is a bare `#`
 * rather than a hash spelling out every default. Values are escaped: sector
 * names contain spaces.
 */
export function viewHash(view: View): string {
  const params = new URLSearchParams()
  if (view.metricId) params.set('metric', view.metricId)
  if (view.sector) params.set('sector', view.sector)
  return params.toString()
}
