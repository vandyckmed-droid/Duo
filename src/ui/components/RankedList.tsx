import { useEffect, useRef, useState } from 'react'
import { type DisplayRow, SecurityRow } from './SecurityRow.tsx'

const PAGE = 80

/**
 * The ranked list, rendered incrementally.
 *
 * Fifteen hundred rows mounted at once makes a phone stutter; a windowing
 * library is more machinery than V1 needs. So the list mounts one page and
 * grows by a page whenever the sentinel below it scrolls into view — the top
 * of the ranking, which is what the product is, is on screen immediately.
 */
export function RankedList({
  rows,
  isSelected,
  isWatched,
  onToggleSelect,
  onToggleWatch,
}: {
  rows: readonly DisplayRow[]
  isSelected: (ticker: string) => boolean
  isWatched: (ticker: string) => boolean
  onToggleSelect: (ticker: string) => void
  onToggleWatch: (ticker: string) => void
}) {
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => setLimit(PAGE), [rows])

  useEffect(() => {
    const node = sentinel.current
    if (!node || limit >= rows.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLimit((l) => Math.min(rows.length, l + PAGE))
        }
      },
      { rootMargin: '600px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [rows, limit])

  return (
    <>
      <ol className="list">
        {rows.slice(0, limit).map((row) => (
          <SecurityRow
            key={row.security.ticker}
            row={row}
            selected={isSelected(row.security.ticker)}
            watched={isWatched(row.security.ticker)}
            onToggleSelect={onToggleSelect}
            onToggleWatch={onToggleWatch}
          />
        ))}
      </ol>
      {limit < rows.length && <div ref={sentinel} className="list-sentinel" aria-hidden="true" />}
    </>
  )
}
