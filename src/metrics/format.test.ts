import { describe, expect, it } from 'vitest'
import { METRICS, metricById } from './index.ts'

const momentum = metricById('momentum')
const volatility = metricById('volatility')

describe('metric formatting', () => {
  it.each([
    ['just under the rounding boundary', 0.999784, '+100%'],
    ['exactly at the boundary', 1, '+100%'],
    ['just under one decimal place', 0.9994, '+99.9%'],
    ['a small positive', 0.035, '+3.5%'],
    ['a negative', -0.674, '−67.4%'],
    ['zero', 0, '0.0%'],
    ['a large value', 3.937, '+394%'],
  ])('formats %s', (_label, value, expected) => {
    expect(momentum.format(value)).toBe(expected)
  })

  it('leaves an unsigned metric unsigned', () => {
    expect(volatility.format(0.918)).toBe('91.8%')
    expect(volatility.format(1.025)).toBe('102%')
  })

  it('never exceeds the six characters the column is sized for', () => {
    for (const metric of METRICS) {
      for (let v = -9.99; v <= 9.99; v += 0.0007) {
        expect(metric.format(v).length).toBeLessThanOrEqual(6)
      }
    }
  })
})
