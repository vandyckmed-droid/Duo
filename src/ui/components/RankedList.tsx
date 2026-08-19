import { useCallback, useEffect, useRef, useState } from 'react'
import type { Row, ScreenResult } from '../../domain/screen.ts'
import type { Metric } from '../../domain/metrics.ts'
import { RankedRow } from './RankedRow.tsx'

/**
 * The scroller.
 *
 * Fifteen hundred rows in the DOM makes a phone stutter on every rerank, so
 * only the rows within the viewport are mounted. That is what keeps "switch
 * the metric" feeling like a state change rather than a page load: the list is
 * re-sorted in a millisecond and roughly twenty rows are re-rendered.
 *
 * Scroll position is reported to the caller so it can be restored on the next
 * visit, and reset to the top whenever the ranking itself changes — staying at
 * row 900 after switching metric would be showing an arbitrary slice of a list
 * the user has not seen the top of.
 */

const ROW_HEIGHT = 68
const OVERSCAN = 8

interface Props {
  readonly result: ScreenResult
  readonly metric: Metric
  readonly watchlist: ReadonlySet<string>
  readonly onOpen: (ticker: string) => void
  readonly onToggleWatch: (ticker: string) => void
  readonly initialScrollTop: number
  readonly onScroll: (top: number) => void
  /** Changing this resets the scroll to the top. */
  readonly resetKey: string
  readonly emptyMessage: string
}

export function RankedList({
  result,
  metric,
  watchlist,
  onOpen,
  onToggleWatch,
  initialScrollTop,
  onScroll,
  resetKey,
  emptyMessage,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [viewportTop, setViewportTop] = useState(initialScrollTop)
  const [viewportHeight, setViewportHeight] = useState(800)
  const restored = useRef(false)

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    setViewportHeight(element.clientHeight)
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = scroller.current
    if (!element || restored.current) return
    restored.current = true
    element.scrollTop = initialScrollTop
    setViewportTop(initialScrollTop)
  }, [initialScrollTop])

  // Only on an actual change of ordering. Without the guard this also fires on
  // the first mount, immediately undoing the restored position above — the
  // list would come back to the top on every visit while appearing to persist.
  const lastKey = useRef(resetKey)
  useEffect(() => {
    const element = scroller.current
    if (!element || lastKey.current === resetKey) return
    lastKey.current = resetKey
    element.scrollTop = 0
    setViewportTop(0)
    onScroll(0)
  }, [resetKey, onScroll])

  const handleScroll = useCallback(() => {
    const top = scroller.current?.scrollTop ?? 0
    setViewportTop(top)
    onScroll(top)
  }, [onScroll])

  const ranked = result.rows
  const unranked = result.unranked
  const unrankedHeaderHeight = unranked.length > 0 ? 34 : 0
  const total = ranked.length * ROW_HEIGHT + unrankedHeaderHeight + unranked.length * ROW_HEIGHT

  const first = Math.max(0, Math.floor(viewportTop / ROW_HEIGHT) - OVERSCAN)
  const last = Math.min(
    ranked.length + unranked.length,
    Math.ceil((viewportTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
  )

  const render = (row: Row, index: number) => {
    const isUnranked = index >= ranked.length
    const top =
      index * ROW_HEIGHT + (isUnranked ? unrankedHeaderHeight : 0)
    return (
      <RankedRow
        key={row.security.ticker}
        row={row}
        metric={metric}
        watched={watchlist.has(row.security.ticker)}
        onOpen={onOpen}
        onToggleWatch={onToggleWatch}
        top={top}
        height={ROW_HEIGHT}
      />
    )
  }

  const all: Row[] = [...ranked, ...unranked]

  return (
    <div className="scroll" ref={scroller} onScroll={handleScroll}>
      {all.length === 0 ? (
        <p className="empty">{emptyMessage}</p>
      ) : (
        <div className="rows" style={{ height: total }}>
          {all.slice(first, last).map((row, i) => render(row, first + i))}
          {unranked.length > 0 && (
            <div
              className="unranked-head"
              style={{ position: 'absolute', top: ranked.length * ROW_HEIGHT, left: 0, right: 0 }}
            >
              {/* Named, not hidden and not ranked last: no value is not a bad value. */}
              No {metric.label.toLowerCase()} — {unranked.length} name
              {unranked.length === 1 ? '' : 's'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
