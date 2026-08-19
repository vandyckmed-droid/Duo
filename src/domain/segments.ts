/**
 * The universe: the S&P Composite 1500, as three size segments.
 *
 * Segment membership is authoritative metadata on every security, not just a
 * display filter: it is stored per name and drives the size filter. Each
 * segment names the ETF that tracks it — the pipeline uses it as a membership
 * source when the provider offers holdings, and SPY doubles as the shared
 * trading-calendar anchor.
 */

export type Segment = '500' | '400' | '600'

export interface SegmentDefinition {
  readonly id: Segment
  /** Short label for the size filter control. */
  readonly label: string
  readonly indexName: string
  /** The ETF tracking this segment. */
  readonly etf: string
}

export const SEGMENTS: readonly SegmentDefinition[] = [
  { id: '500', label: '500', indexName: 'S&P 500', etf: 'SPY' },
  { id: '400', label: '400', indexName: 'S&P MidCap 400', etf: 'IJH' },
  { id: '600', label: '600', indexName: 'S&P SmallCap 600', etf: 'IJR' },
]

export const SEGMENT_IDS: readonly Segment[] = SEGMENTS.map((s) => s.id)

const BY_ID = new Map(SEGMENTS.map((s) => [s.id, s]))

export function isSegment(value: string): value is Segment {
  return BY_ID.has(value as Segment)
}

/** The ticker whose trading days define the shared calendar. */
export const CALENDAR_TICKER = 'SPY'
