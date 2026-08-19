import { Fragment, useState } from 'react'
import { METRICS } from '../../domain/metrics.ts'
import type { Metric } from '../../domain/metrics.ts'
import type { Screen } from '../../domain/screen.ts'
import { SEGMENTS, type Segment } from '../../domain/segments.ts'

/**
 * The ranking controls.
 *
 * They live on the list, never in Settings. Choosing what to rank by is the
 * central act of the product, so it is one tap from the rows it reorders: a
 * strip of metric names above the list, and the segment filter directly under
 * it. Sector, search and direction sit behind a disclosure because they are
 * used far less often and would otherwise crowd the two that matter.
 *
 * Everything here is local state. Nothing on this bar can cause a request.
 */

interface Props {
  readonly screen: Screen
  readonly metric: Metric
  readonly sectors: readonly string[]
  readonly showFilters: boolean
  readonly counts: { shown: number; total: number }
  readonly onChange: (patch: Partial<Screen>) => void
  readonly onToggleFilters: () => void
}

export function Controls({
  screen,
  metric,
  sectors,
  showFilters,
  counts,
  onChange,
  onToggleFilters,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const activeFilters =
    (screen.segment ? 1 : 0) + (screen.sector ? 1 : 0) + (screen.query.trim() ? 1 : 0)

  return (
    <>
      <div className="strip" role="tablist" aria-label="Ranking variable">
        {METRICS.map((m, i) => (
          <Fragment key={m.id}>
            {i > 0 && METRICS[i - 1]?.family !== m.family && (
              <span className="strip-gap" aria-hidden="true" />
            )}
            <button
              role="tab"
              className="strip-item"
              aria-selected={m.id === screen.metricId}
              onClick={() => onChange({ metricId: m.id })}
            >
              {m.short}
            </button>
          </Fragment>
        ))}
      </div>

      <div className="subhead">
        <div className="segments" role="group" aria-label="Index segment">
          <button aria-pressed={screen.segment === null} onClick={() => onChange({ segment: null })}>
            All
          </button>
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              aria-pressed={screen.segment === s.id}
              onClick={() => onChange({ segment: s.id as Segment })}
              title={`${s.indexName} — β vs ${s.benchmark}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button className="linkish" aria-pressed={showFilters} onClick={onToggleFilters}>
          {activeFilters > 0 ? `Filters · ${activeFilters}` : 'Filters'}
        </button>
      </div>

      {showFilters && (
        <div className="disclosure">
          <input
            className="search"
            type="search"
            inputMode="search"
            placeholder="Ticker or company"
            value={screen.query}
            onChange={(e) => onChange({ query: e.target.value })}
          />
          <div className="strip" role="group" aria-label="Sector">
            <button
              className="strip-item"
              aria-pressed={screen.sector === null}
              onClick={() => onChange({ sector: null })}
            >
              All sectors
            </button>
            {sectors.map((sector) => (
              <button
                key={sector}
                className="strip-item"
                aria-pressed={screen.sector === sector}
                onClick={() => onChange({ sector: screen.sector === sector ? null : sector })}
              >
                {sector}
              </button>
            ))}
          </div>
          <div className="subhead" style={{ borderTop: 0, padding: 0 }}>
            <span>
              {counts.shown} of {counts.total}
            </span>
            <button
              className="linkish"
              aria-pressed={screen.invert}
              onClick={() => onChange({ invert: !screen.invert })}
            >
              {screen.invert ? 'Worst first' : 'Best first'}
            </button>
          </div>
        </div>
      )}

      {/* The rule is on the screen that applies it — a ranking whose
          definition lives elsewhere is an opaque ranking. It sits on one line
          until tapped, so being explainable costs a line rather than a fifth
          of the screen. */}
      <button
        className={`definition${expanded ? '' : ' definition-clamped'}`}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <strong style={{ color: 'var(--text)' }}>{metric.label}.</strong> {metric.definition}
      </button>
    </>
  )
}
