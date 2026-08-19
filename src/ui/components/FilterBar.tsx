import type { Filters } from '../../state/filters.ts'
import { SEGMENTS, type Segment } from '../../domain/segments.ts'

/** Search, size, sector — V1's only controls, in one sticky block. */
export function FilterBar({
  filters,
  sectors,
  onChange,
}: {
  filters: Filters
  sectors: readonly string[]
  onChange: (filters: Filters) => void
}) {
  const sizes: { id: Segment | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    ...SEGMENTS.map((s) => ({ id: s.id, label: s.label })),
  ]

  return (
    <div className="filters">
      <input
        type="search"
        className="search"
        placeholder="Search ticker or company"
        aria-label="Search ticker or company"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        enterKeyHint="search"
        value={filters.query}
        onChange={(e) => onChange({ ...filters, query: e.target.value })}
      />
      <div className="filters-line">
        <div className="segmented" role="group" aria-label="Index size">
          {sizes.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={filters.segment === id ? 'is-active' : ''}
              aria-pressed={filters.segment === id}
              onClick={() => onChange({ ...filters, segment: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="sector-select"
          aria-label="Sector"
          value={filters.sector}
          onChange={(e) => onChange({ ...filters, sector: e.target.value })}
        >
          <option value="all">All sectors</option>
          {sectors.map((sector) => (
            <option key={sector} value={sector}>
              {sector}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
