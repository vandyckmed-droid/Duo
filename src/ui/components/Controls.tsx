import { useRef, useState } from 'react'
import { METRICS } from '../../domain/metrics.ts'
import type { Metric } from '../../domain/metrics.ts'
import {
  DEFAULT_RANK_SPEC,
  parseRankMetricId,
  rankMetricId,
  type RankSpec,
} from '../../domain/rankSpec.ts'
import type { Screen } from '../../domain/screen.ts'
import { SEGMENTS, type Segment } from '../../domain/segments.ts'

/** The statistics offered outside the primary controls. */
const STANDALONE = METRICS.filter((m) => m.family !== 'rank')

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

  // The dimensional controls. `spec` is null while a standalone statistic
  // ranks the list; the last dimensional configuration is remembered so a
  // tap on any dimension returns to the methodology the user had built,
  // with that dimension applied.
  const spec = parseRankMetricId(screen.metricId)
  const lastSpec = useRef<RankSpec>(DEFAULT_RANK_SPEC)
  if (spec) lastSpec.current = spec
  const base = spec ?? lastSpec.current
  const apply = (patch: Partial<RankSpec>) =>
    onChange({ metricId: rankMetricId({ ...base, ...patch }) })
  const flip = (key: 'skip' | 'residual' | 'divVol') =>
    spec ? apply({ [key]: !spec[key] }) : apply({ [key]: true })

  return (
    <>
      <div className="rank-controls">
        <div className="rank-window" role="group" aria-label="Return window">
          {(['12M', '6M'] as const).map((w) => (
            <button
              key={w}
              aria-pressed={spec !== null && spec.window === w}
              onClick={() => apply({ window: w })}
            >
              {w}
            </button>
          ))}
        </div>
        <span className="rank-divider" aria-hidden="true" />
        <div className="rank-toggles" role="group" aria-label="Ranking adjustments">
          <button aria-pressed={spec !== null && spec.skip} onClick={() => flip('skip')}>
            Skip 1M
          </button>
          <button aria-pressed={spec !== null && spec.residual} onClick={() => flip('residual')}>
            Residual
          </button>
          <button aria-pressed={spec !== null && spec.divVol} onClick={() => flip('divVol')}>
            ÷ Vol
          </button>
        </div>
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
          {/* Standalone statistics: separate metrics, not dimensions of the
              primary methodology, so they live behind the disclosure. */}
          <div className="strip" style={{ padding: 0 }} role="group" aria-label="Other metrics">
            {STANDALONE.map((m) => (
              <button
                key={m.id}
                className="strip-item"
                aria-pressed={m.id === screen.metricId}
                onClick={() => onChange({ metricId: m.id })}
              >
                {m.short}
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
          definition lives elsewhere is an opaque ranking. Until tapped only
          the metric's name shows, with an ⓘ marking that the full methodology
          is one tap away, so being explainable costs a short line rather than
          a paragraph. */}
      <button
        className="definition"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <strong style={{ color: 'var(--text)' }}>{metric.label}</strong>
        {expanded ? (
          <>. {metric.definition}</>
        ) : (
          <span className="definition-hint" aria-hidden="true">
            ⓘ
          </span>
        )}
      </button>
    </>
  )
}
