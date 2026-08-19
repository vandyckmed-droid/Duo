import { describe, expect, it } from 'vitest'
import { parseViewHash, viewHash } from './viewState.ts'

describe('parseViewHash', () => {
  it('reads both values', () => {
    expect(parseViewHash('#metric=volatility&sector=Energy')).toEqual({
      metricId: 'volatility',
      sector: 'Energy',
    })
  })

  it('does not require the leading hash', () => {
    expect(parseViewHash('metric=residual')).toEqual({
      metricId: 'residual',
      sector: null,
    })
  })

  it('reports an empty hash as no metric and no filter', () => {
    expect(parseViewHash('')).toEqual({ metricId: '', sector: null })
    expect(parseViewHash('#')).toEqual({ metricId: '', sector: null })
  })

  it('decodes a sector containing a space', () => {
    expect(parseViewHash('#sector=Real+Estate').sector).toBe('Real Estate')
    expect(parseViewHash('#sector=Real%20Estate').sector).toBe('Real Estate')
  })

  it('still reads a metric-only hash, as older links have', () => {
    expect(parseViewHash('#metric=momentum')).toEqual({
      metricId: 'momentum',
      sector: null,
    })
  })
})

describe('viewHash', () => {
  it('writes both values', () => {
    expect(viewHash({ metricId: 'momentum', sector: 'Utilities' })).toBe(
      'metric=momentum&sector=Utilities',
    )
  })

  it('leaves out an absent sector', () => {
    expect(viewHash({ metricId: 'momentum', sector: null })).toBe(
      'metric=momentum',
    )
  })

  it('leaves out an absent metric', () => {
    expect(viewHash({ metricId: '', sector: 'Energy' })).toBe('sector=Energy')
  })

  it('is empty for an empty view', () => {
    expect(viewHash({ metricId: '', sector: null })).toBe('')
  })

  it('escapes a sector containing a space', () => {
    expect(viewHash({ metricId: '', sector: 'Health Care' })).toBe(
      'sector=Health+Care',
    )
  })

  it('round-trips through the parser', () => {
    const view = { metricId: 'residual', sector: 'Consumer Discretionary' }
    expect(parseViewHash(`#${viewHash(view)}`)).toEqual(view)
  })
})
