/**
 * The sector filter.
 *
 * A native `<select>` rather than a row of chips: eleven sectors with names
 * as long as "Consumer Discretionary" would either wrap into a block that
 * pushes the ranking off a phone screen, or scroll sideways and hide most of
 * their own options. The platform's picker is one tap, shows all eleven at
 * once, and needs no keyboard or focus handling of its own.
 */
export function SectorFilter({
  sectors,
  active,
  onChange,
}: {
  readonly sectors: readonly string[]
  readonly active: string | null
  readonly onChange: (sector: string | null) => void
}) {
  return (
    <div className="filters">
      <label className="column-label" htmlFor="sector-filter">
        Sector
      </label>
      <span className="select-shell">
        <select
          id="sector-filter"
          className="sector-select"
          value={active ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
        >
          {/* The empty value is the unfiltered index, not a twelfth sector. */}
          <option value="">All sectors</option>
          {sectors.map((sector) => (
            <option key={sector} value={sector}>
              {sector}
            </option>
          ))}
        </select>
      </span>
    </div>
  )
}
