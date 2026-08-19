import { formatPrice } from '../format.ts'

/**
 * The compact 52-week range: low ───────○─── high, with the dot marking the
 * latest close's position inside the range.
 */
export function RangeBar({ low, high, last }: { low: number; high: number; last: number }) {
  const span = high - low
  const position = span > 0 ? Math.min(1, Math.max(0, (last - low) / span)) : 0.5
  return (
    <div className="range" aria-label={`52-week range ${formatPrice(low)} to ${formatPrice(high)}, last ${formatPrice(last)}`}>
      <span className="range-end">{formatPrice(low)}</span>
      <span className="range-track">
        <span className="range-dot" style={{ left: `${(position * 100).toFixed(1)}%` }} />
      </span>
      <span className="range-end">{formatPrice(high)}</span>
    </div>
  )
}
