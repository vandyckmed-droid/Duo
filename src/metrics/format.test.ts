import { describe, expect, it } from 'vitest'
import { formatPercent, formatRatio } from './format.ts'

describe('formatPercent', () => {
  it.each([
    [0.2413, '+24.1%'],
    [1.6631, '+166.3%'],
    [-0.049, '-4.9%'],
    [0, '0.0%'],
    [0.00004, '+0.0%'],
  ])('renders %s as %s', (value, expected) => {
    expect(formatPercent(value)).toBe(expected)
  })
})

describe('formatRatio', () => {
  it.each([
    [1.2837, '1.28'],
    [-0.4, '-0.40'],
    [1, '1.00'],
  ])('renders %s as %s', (value, expected) => {
    expect(formatRatio(value)).toBe(expected)
  })
})
