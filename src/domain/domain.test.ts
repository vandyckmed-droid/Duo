import { describe, expect, it } from 'vitest'
import { BENCHMARK_TICKERS, SEGMENTS, benchmarkFor, isSegment, segmentDefinition } from './segments.ts'
import { BETA_LOOKBACK, RANK_CHANGE_OFFSET, WINDOWS, WINDOW_IDS } from './windows.ts'
import { DEFAULT_METRIC_ID, METRICS, isMetricId, metric } from './metrics.ts'
import { EMPTY, marketCap, percent, percentPlain, signedInteger, sign } from './format.ts'
import { GICS_SECTORS, canonicalSector } from './sectors.ts'

describe('segments', () => {
  it('maps each segment to its own benchmark ETF', () => {
    expect(benchmarkFor('500')).toBe('SPY')
    expect(benchmarkFor('400')).toBe('IJH')
    expect(benchmarkFor('600')).toBe('IJR')
  })

  it('never sends a 400 or 600 name to SPY', () => {
    // The single most damaging way to get this wrong: a mid- or small-cap
    // regressed against the large-cap index reports the size premium as
    // stock-specific return.
    expect(benchmarkFor('400')).not.toBe(benchmarkFor('500'))
    expect(benchmarkFor('600')).not.toBe(benchmarkFor('500'))
    expect(benchmarkFor('400')).not.toBe(benchmarkFor('600'))
  })

  it('gives every segment a distinct benchmark', () => {
    expect(new Set(BENCHMARK_TICKERS).size).toBe(SEGMENTS.length)
  })

  it('throws on an unknown segment rather than falling back to the first', () => {
    expect(() => segmentDefinition('700' as never)).toThrow(/Unknown segment/)
  })

  it('recognises exactly the three segment ids', () => {
    expect(isSegment('500')).toBe(true)
    expect(isSegment('400')).toBe(true)
    expect(isSegment('600')).toBe(true)
    expect(isSegment('1500')).toBe(false)
    expect(isSegment('')).toBe(false)
  })
})

describe('windows', () => {
  it('defines 12−1 as a year of formation with a month skipped', () => {
    expect(WINDOWS['12-1']).toEqual({ formation: 252, skip: 21 })
  })

  it('defines 6−1 with half the formation and the same skipped month', () => {
    expect(WINDOWS['6-1'].formation).toBe(WINDOWS['12-1'].formation / 2)
    expect(WINDOWS['6-1'].skip).toBe(WINDOWS['12-1'].skip)
  })

  it('keeps raw returns unskipped', () => {
    expect(WINDOWS['12M'].skip).toBe(0)
    expect(WINDOWS['3M']).toEqual({ formation: 63, skip: 0 })
  })

  it('holds enough history for the longest calculation', () => {
    const longest = Math.max(...WINDOW_IDS.map((id) => WINDOWS[id].formation + WINDOWS[id].skip))
    expect(BETA_LOOKBACK).toBeGreaterThan(longest)
    // Prior values are evaluated a quarter back, so the cache must cover both.
    expect(BETA_LOOKBACK + RANK_CHANGE_OFFSET).toBeGreaterThan(longest + RANK_CHANGE_OFFSET - 1)
  })

  it('counts every window in trading days, never in months', () => {
    for (const id of WINDOW_IDS) {
      expect(Number.isInteger(WINDOWS[id].formation)).toBe(true)
      expect(Number.isInteger(WINDOWS[id].skip)).toBe(true)
    }
  })
})

describe('metric registry', () => {
  it('has unique ids', () => {
    expect(new Set(METRICS.map((m) => m.id)).size).toBe(METRICS.length)
  })

  it('covers every ranking variable the list offers', () => {
    const ids = METRICS.map((m) => m.id)
    for (const id of [
      '12-1',
      '6-1',
      '12M',
      '6M',
      'res-12-1',
      'res-12-1-v',
      '3M',
      'return-vol',
      'volatility',
      'beta',
      'rank-change',
      'market-cap',
    ]) {
      expect(ids).toContain(id)
    }
  })

  it('states a definition for every metric, so no ranking is unexplained', () => {
    for (const m of METRICS) {
      expect(m.definition.length).toBeGreaterThan(30)
      expect(m.short.length).toBeGreaterThan(0)
      // The compact strip that demanded six characters is gone; the widest
      // remaining short is the dimensional "R12−1/V".
      expect(m.short.length).toBeLessThanOrEqual(8)
    }
  })

  it('ranks volatility low-first and momentum high-first', () => {
    expect(metric('volatility').direction).toBe('asc')
    expect(metric('12-1').direction).toBe('desc')
  })

  it('bases rank change on a real metric', () => {
    const rc = metric('rank-change')
    expect(rc.kind).toBe('rank-change')
    expect(isMetricId(rc.basedOn as string)).toBe(true)
  })

  it('falls back to the default rather than crashing on an unknown id', () => {
    expect(metric('nonsense').id).toBe(DEFAULT_METRIC_ID)
    expect(isMetricId('nonsense')).toBe(false)
  })
})

describe('formatting', () => {
  it('renders unavailable as a dash and never as zero', () => {
    expect(percent(null)).toBe(EMPTY)
    expect(percent(Number.NaN)).toBe(EMPTY)
    expect(marketCap(0)).toBe(EMPTY)
    expect(signedInteger(undefined)).toBe(EMPTY)
    expect(percent(0)).toBe('+0.0%')
  })

  it('signs changes and leaves magnitudes unsigned', () => {
    expect(percent(0.1234)).toBe('+12.3%')
    expect(percent(-0.1234)).toBe('−12.3%')
    expect(percentPlain(0.284)).toBe('28.4%')
  })

  it('scales market cap to the units people say out loud', () => {
    expect(marketCap(4.55e12)).toBe('$4.55T')
    expect(marketCap(8.2e9)).toBe('$8.2B')
    expect(marketCap(4.1e11)).toBe('$410B')
    expect(marketCap(6.4e8)).toBe('$640M')
  })

  it('reduces a value to its sign for colouring', () => {
    expect(sign(0.1)).toBe(1)
    expect(sign(-0.1)).toBe(-1)
    expect(sign(0)).toBe(0)
    expect(sign(null)).toBe(0)
  })
})

describe('sector normalisation', () => {
  it('maps both provider vocabularies onto the same GICS sector', () => {
    // FMP labels the 500 in a Yahoo-derived scheme; the index tables use GICS.
    // Left unmapped, a Financials filter would omit every large-cap bank.
    expect(canonicalSector('Financial Services')).toBe(canonicalSector('Financials'))
    expect(canonicalSector('Technology')).toBe('Information Technology')
    expect(canonicalSector('Healthcare')).toBe('Health Care')
    expect(canonicalSector('Consumer Cyclical')).toBe('Consumer Discretionary')
    expect(canonicalSector('Consumer Defensive')).toBe('Consumer Staples')
    expect(canonicalSector('Basic Materials')).toBe('Materials')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(canonicalSector('  information technology ')).toBe('Information Technology')
  })

  it('collapses an unrecognised label to Unknown rather than inventing a sector', () => {
    expect(canonicalSector('Miscellaneous')).toBe('Unknown')
    expect(canonicalSector('')).toBe('Unknown')
    expect(canonicalSector(null)).toBe('Unknown')
  })

  it('every canonical name maps to itself', () => {
    for (const sector of GICS_SECTORS) expect(canonicalSector(sector)).toBe(sector)
  })

  it('there are exactly eleven GICS sectors', () => {
    expect(GICS_SECTORS).toHaveLength(11)
  })
})
