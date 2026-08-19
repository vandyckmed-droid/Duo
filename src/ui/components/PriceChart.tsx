import { useMemo, useRef, useState } from 'react'
import { isoToDisplay, percent, price } from '../../domain/format.ts'

/**
 * The price chart.
 *
 * A single line on a quiet background, no gridlines, no axis furniture, no
 * area fill. The shape of the line is the information; everything else was
 * decoration and has been removed.
 *
 * Touch moves a crosshair and rewrites the header above the chart, so
 * inspecting a date is a drag rather than a tap-and-wait tooltip. The line is
 * coloured by the return over the visible horizon, so the chart answers "up or
 * down over this period?" before it is read at all.
 *
 * Gaps are breaks in the line, not straight segments across them: drawing
 * through a suspension would invent prices that never traded.
 */

const HEIGHT = 210
const WIDTH = 1000
const PAD_Y = 14
/* A hair of horizontal inset: at x = 0 and x = WIDTH the stroke is half
   outside the viewBox and the first and last day get clipped down the middle. */
const PAD_X = 4

export interface ChartPoint {
  readonly date: string
  readonly close: number | null
}

interface Props {
  readonly points: readonly ChartPoint[]
  readonly label: string
}

export function PriceChart({ points, label }: Props) {
  const [cursor, setCursor] = useState<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)

  const model = useMemo(() => build(points), [points])

  if (!model) {
    return (
      <>
        <div className="price-head">
          <div className="price-now num">—</div>
          <div className="price-label">No price history for this period</div>
        </div>
        <div className="chart" style={{ height: HEIGHT }} />
      </>
    )
  }

  const { valid, min, max, path, firstClose, lastClose } = model
  const active = cursor === null ? null : (valid[clamp(cursor, 0, valid.length - 1)] as Indexed)
  const shown = active ?? (valid.at(-1) as Indexed)
  const change = shown.close / firstClose - 1
  const overall = lastClose / firstClose - 1
  const tone = overall >= 0 ? 'up' : 'down'

  const x = (i: number) => PAD_X + (i / Math.max(1, valid.length - 1)) * (WIDTH - PAD_X * 2)
  const y = (close: number) =>
    max === min ? HEIGHT / 2 : PAD_Y + ((max - close) / (max - min)) * (HEIGHT - PAD_Y * 2)

  const locate = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const ratio = clamp((clientX - box.left) / box.width, 0, 1)
    setCursor(Math.round(ratio * (valid.length - 1)))
  }

  return (
    <>
      <div className="price-head">
        <div className="price-now num">{price(shown.close)}</div>
        <div className={`price-change num ${change >= 0 ? 'up' : 'down'}`}>
          {percent(change, 2)}
          <span className="dim" style={{ fontWeight: 500 }}>
            {'  '}
            {label}
          </span>
        </div>
        <div className="price-label">
          {active ? isoToDisplay(active.date) : `Adjusted close · ${isoToDisplay(shown.date)}`}
        </div>
      </div>

      <div
        className="chart"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          locate(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === 'mouse') locate(e.clientX)
        }}
        onPointerUp={() => setCursor(null)}
        onPointerLeave={() => setCursor(null)}
      >
        <svg
          ref={svg}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label} price chart, ${percent(overall, 1)}`}
        >
          {/* The starting price, so the line's position reads as a return. */}
          <line
            className="chart-base"
            x1={0}
            x2={WIDTH}
            y1={y(firstClose)}
            y2={y(firstClose)}
          />
          <path className={`chart-line ${tone}`} d={path} stroke="currentColor" />
          {active && (
            <>
              <line
                className="chart-cursor"
                x1={x(active.position)}
                x2={x(active.position)}
                y1={0}
                y2={HEIGHT}
              />
              <circle
                className={`chart-dot ${tone}`}
                cx={x(active.position)}
                cy={y(active.close)}
                r={4}
                fill="currentColor"
              />
            </>
          )}
        </svg>
      </div>

      <div className="chart-axis num">
        <span>{isoToDisplay(valid[0]?.date)}</span>
        <span>{price(min)} – {price(max)}</span>
        <span>{isoToDisplay(valid.at(-1)?.date)}</span>
      </div>
    </>
  )
}

interface Indexed {
  readonly date: string
  readonly close: number
  /** Position among the usable observations, which is what the x-axis uses. */
  readonly position: number
  /** Index in the original array, used to detect gaps. */
  readonly source: number
}

function build(points: readonly ChartPoint[]) {
  const valid: Indexed[] = []
  points.forEach((p, source) => {
    if (typeof p.close === 'number' && Number.isFinite(p.close) && p.close > 0) {
      valid.push({ date: p.date, close: p.close, position: valid.length, source })
    }
  })
  if (valid.length < 2) return null

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const p of valid) {
    if (p.close < min) min = p.close
    if (p.close > max) max = p.close
  }

  const x = (i: number) => PAD_X + (i / (valid.length - 1)) * (WIDTH - PAD_X * 2)
  const y = (close: number) =>
    max === min ? HEIGHT / 2 : PAD_Y + ((max - close) / (max - min)) * (HEIGHT - PAD_Y * 2)

  let path = ''
  valid.forEach((p, i) => {
    const previous = valid[i - 1]
    // More than a week of missing observations is a break in the security's
    // history, and the line breaks with it rather than bridging the hole.
    const broken = !previous || p.source - previous.source > 5
    path += `${broken ? 'M' : 'L'}${x(i).toFixed(2)} ${y(p.close).toFixed(2)} `
  })

  return {
    valid,
    min,
    max,
    path: path.trim(),
    firstClose: (valid[0] as Indexed).close,
    lastClose: (valid.at(-1) as Indexed).close,
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
