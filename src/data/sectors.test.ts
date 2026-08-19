import { describe, expect, it } from 'vitest'
import { resolveSector, sectorsIn } from './sectors.ts'
import type { Stock } from './types.ts'

const stock = (ticker: string, sector: string): Stock => ({
  ticker,
  name: ticker,
  sector,
})

describe('sectorsIn', () => {
  it('lists each sector once, alphabetically', () => {
    const stocks = [
      stock('A', 'Utilities'),
      stock('B', 'Energy'),
      stock('C', 'Utilities'),
      stock('D', 'Materials'),
    ]

    expect(sectorsIn(stocks)).toEqual(['Energy', 'Materials', 'Utilities'])
  })

  it('is empty for an empty universe', () => {
    expect(sectorsIn([])).toEqual([])
  })
})

describe('resolveSector', () => {
  const sectors = ['Energy', 'Utilities']

  it('accepts a sector that exists', () => {
    expect(resolveSector(sectors, 'Energy')).toBe('Energy')
  })

  it('rejects one that does not, rather than filtering to nothing', () => {
    expect(resolveSector(sectors, 'Tulips')).toBeNull()
  })

  it('treats absent, empty and null as no filter', () => {
    expect(resolveSector(sectors, null)).toBeNull()
    expect(resolveSector(sectors, undefined)).toBeNull()
    expect(resolveSector(sectors, '')).toBeNull()
  })

  it('is case-sensitive, matching the dataset spelling', () => {
    expect(resolveSector(sectors, 'energy')).toBeNull()
  })
})
