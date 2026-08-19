import { describe, expect, it } from 'vitest'
import { INITIAL, sanitise, toggleWatch } from './viewState.ts'

describe('sanitise', () => {
  it('accepts a well-formed state unchanged', () => {
    const state = sanitise({
      screen: {
        metricId: 'volatility',
        segment: '600',
        sector: 'Energy',
        watchlistOnly: true,
        invert: true,
        query: 'ab',
      },
      tab: 'portfolio',
      watchlist: ['AAPL', 'MSFT'],
      open: 'AAPL',
      scrollTop: 400,
      scheme: 'hrp',
      capPerHolding: 0.2,
      capPerSector: 0.4,
    })
    expect(state.screen.metricId).toBe('volatility')
    expect(state.screen.segment).toBe('600')
    expect(state.tab).toBe('portfolio')
    expect(state.watchlist).toEqual(['AAPL', 'MSFT'])
    expect(state.capPerHolding).toBe(0.2)
  })

  it('falls back rather than rendering an empty list for a stale metric id', () => {
    // A metric removed in a later release must not leave a returning user
    // looking at a blank screen that reads as broken data.
    expect(sanitise({ screen: { metricId: 'removed-metric' } as never }).screen.metricId).toBe(
      INITIAL.screen.metricId,
    )
  })

  it('rejects a segment that is not one of the three', () => {
    expect(sanitise({ screen: { segment: '700' } as never }).screen.segment).toBeNull()
  })

  it('survives corrupt or hand-edited storage', () => {
    expect(sanitise(null)).toEqual(INITIAL)
    expect(sanitise(undefined)).toEqual(INITIAL)
    expect(sanitise({ watchlist: 'AAPL' } as never).watchlist).toEqual([])
    expect(sanitise({ scrollTop: Number.NaN }).scrollTop).toBe(0)
    expect(sanitise({ scrollTop: -50 }).scrollTop).toBe(0)
  })

  it('deduplicates the watchlist and drops non-strings', () => {
    expect(sanitise({ watchlist: ['A', 'A', 'B', 1 as never] }).watchlist).toEqual(['A', 'B'])
  })

  it('rejects caps outside (0, 1]', () => {
    expect(sanitise({ capPerHolding: 0 }).capPerHolding).toBeNull()
    expect(sanitise({ capPerHolding: 1.5 }).capPerHolding).toBeNull()
    expect(sanitise({ capPerHolding: 1 }).capPerHolding).toBe(1)
  })

  it('bounds the search query', () => {
    expect(sanitise({ screen: { query: 'x'.repeat(200) } as never }).screen.query).toHaveLength(40)
  })
})

describe('toggleWatch', () => {
  it('adds a name to the end and removes it again', () => {
    expect(toggleWatch(['A'], 'B')).toEqual(['A', 'B'])
    expect(toggleWatch(['A', 'B'], 'A')).toEqual(['B'])
  })

  it('preserves the order names were added in', () => {
    let list = toggleWatch([], 'C')
    list = toggleWatch(list, 'A')
    list = toggleWatch(list, 'B')
    expect(list).toEqual(['C', 'A', 'B'])
  })
})
