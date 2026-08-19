import { describe, expect, it } from 'vitest'
import { classifyRegime, describeRegime } from './regime.ts'

describe('classifyRegime', () => {
  it('is normal near the high with a positive half-year', () => {
    expect(classifyRegime(0.98, 0.08, 0.02)).toBe('normal')
  })

  it('is caution below 90% of the high', () => {
    expect(classifyRegime(0.85, 0.08, 0.01)).toBe('caution')
  })

  it('is caution at the high when the six-month return is negative', () => {
    expect(classifyRegime(0.95, -0.02, 0.01)).toBe('caution')
  })

  it('is reversal risk only when deep below the high AND rallying hard', () => {
    expect(classifyRegime(0.8, -0.1, 0.08)).toBe('reversal-risk')
    // The same rally near the high is just a rally.
    expect(classifyRegime(0.97, 0.05, 0.08)).toBe('normal')
    // Deep below the high without the rally is ordinary caution.
    expect(classifyRegime(0.8, -0.1, 0.01)).toBe('caution')
  })

  it('sits exactly on the lines: 90% is not below it, +5% is not above it', () => {
    expect(classifyRegime(0.9, 0.01, 0.06)).toBe('normal')
    expect(classifyRegime(0.89, 0.01, 0.05)).toBe('caution')
  })
})

describe('describeRegime', () => {
  it('names the drawdown in the caution line', () => {
    const text = describeRegime({ state: 'caution', fromHigh: 0.88, return6M: 0.02, return1M: 0 })
    expect(text).toContain('12%')
    expect(text).toContain('Caution')
  })

  it('explains a trend-only caution without a drawdown percentage', () => {
    const text = describeRegime({ state: 'caution', fromHigh: 0.95, return6M: -0.03, return1M: 0 })
    expect(text).toContain('six months')
  })

  it('never gives advice', () => {
    for (const state of ['normal', 'caution', 'reversal-risk'] as const) {
      const text = describeRegime({ state, fromHigh: 0.85, return6M: -0.1, return1M: 0.08 })
      expect(text.toLowerCase()).not.toMatch(/\b(sell|buy|should|avoid|exit)\b/)
    }
  })
})
