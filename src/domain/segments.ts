/**
 * The universe: the S&P 1500, as three segments each with its own benchmark.
 *
 * Segment membership is authoritative metadata on every security, not a
 * display filter. It decides which ETF a name's beta and residual return are
 * measured against, and getting that wrong does not produce a slightly worse
 * number — it produces a different quantity with the same label. A MidCap 400
 * name regressed against SPY reports the mid-cap size premium as if it were
 * stock-specific return.
 *
 * The benchmarks are real, tradeable ETFs rather than indices reconstructed
 * from today's constituents. A reconstructed benchmark silently omits every
 * name that left the index over the period, and those skew towards the worst
 * performers, so its returns are flattered by survivorship. An ETF's realised
 * price already contains every reconstitution as it happened.
 */

export type Segment = '500' | '400' | '600'

export interface SegmentDefinition {
  readonly id: Segment
  /** Short label for the filter control. */
  readonly label: string
  readonly indexName: string
  /** The ETF this segment's securities are regressed against. */
  readonly benchmark: string
  readonly benchmarkName: string
}

export const SEGMENTS: readonly SegmentDefinition[] = [
  {
    id: '500',
    label: '500',
    indexName: 'S&P 500',
    benchmark: 'SPY',
    benchmarkName: 'SPDR S&P 500 ETF Trust',
  },
  {
    id: '400',
    label: '400',
    indexName: 'S&P MidCap 400',
    benchmark: 'IJH',
    benchmarkName: 'iShares Core S&P Mid-Cap ETF',
  },
  {
    id: '600',
    label: '600',
    indexName: 'S&P SmallCap 600',
    benchmark: 'IJR',
    benchmarkName: 'iShares Core S&P Small-Cap ETF',
  },
]

export const SEGMENT_IDS: readonly Segment[] = SEGMENTS.map((s) => s.id)

const BY_ID = new Map(SEGMENTS.map((s) => [s.id, s]))

export function segmentDefinition(id: Segment): SegmentDefinition {
  const found = BY_ID.get(id)
  // Not a defensive nicety: a typo'd segment silently falling back to the
  // first entry would regress small caps against SPY and never say so.
  if (!found) throw new Error(`Unknown segment: ${id}`)
  return found
}

/** The benchmark ticker a security in this segment must be measured against. */
export function benchmarkFor(id: Segment): string {
  return segmentDefinition(id).benchmark
}

export function isSegment(value: string): value is Segment {
  return BY_ID.has(value as Segment)
}

/** Every benchmark ticker, for the pipeline to fetch alongside the universe. */
export const BENCHMARK_TICKERS: readonly string[] = SEGMENTS.map((s) => s.benchmark)
