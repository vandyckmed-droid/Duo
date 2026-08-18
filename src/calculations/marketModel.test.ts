import { describe, expect, it } from 'vitest'
import type { PriceSeries } from '../data/types.ts'
import { parseIsoDateToUtc } from './isoDate.ts'
import {
  alignedDailyReturns,
  calculateResidualReturn,
  estimateBeta,
} from './marketModel.ts'
import type { MonthWindow } from './windowedReturn.ts'

const TWELVE_ONE: MonthWindow = { fromMonthsAgo: 12, toMonthsAgo: 1 }

const DAY = 86_400_000
const START = parseIsoDateToUtc('2023-06-01') as number

/** A series of `closes` on consecutive days from 2023-06-01. */
function series(closes: readonly (number | null)[]): PriceSeries {
  return {
    timestamps: closes.map((_, i) => START + i * DAY),
    closes,
  }
}

/** A benchmark that drifts up with a repeating, non-constant pattern. */
function benchmarkCloses(days: number): number[] {
  const swings = [0.004, -0.002, 0.006, -0.005, 0.003, 0.001, -0.003]
  const out = [100]
  for (let i = 1; i < days; i++) {
    out.push(out[i - 1] * (1 + swings[i % swings.length]))
  }
  return out
}

/** An asset whose daily return is exactly `beta` times the benchmark's. */
function leveredCloses(benchmark: readonly number[], beta: number): number[] {
  const out = [50]
  for (let i = 1; i < benchmark.length; i++) {
    const marketReturn = benchmark[i] / benchmark[i - 1] - 1
    out.push(out[i - 1] * (1 + beta * marketReturn))
  }
  return out
}

describe('alignedDailyReturns', () => {
  it('pairs one return per interval between usable closes', () => {
    const asset = series([100, 110, 121])
    const bench = series([50, 55, 60.5])

    const { asset: a, benchmark: b } = alignedDailyReturns(asset, bench)

    expect(a).toHaveLength(2)
    expect(b).toHaveLength(2)
  })

  it('skips a date either side is missing, keeping intervals matched', () => {
    const asset = series([100, null, 121])
    const bench = series([50, 55, 60.5])

    const { asset: a, benchmark: b } = alignedDailyReturns(asset, bench)

    // One interval survives, spanning the gap in *both* series — not the
    // asset's two-day move against the benchmark's one-day move.
    expect(a).toEqual([expect.closeTo(0.21, 10)])
    expect(b).toEqual([expect.closeTo(0.21, 10)])
  })

  it('skips a date the benchmark is missing', () => {
    const asset = series([100, 110, 121])
    const bench = series([50, null, 60.5])

    const { asset: a, benchmark: b } = alignedDailyReturns(asset, bench)

    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })
})

describe('estimateBeta', () => {
  it('returns exactly 1 for the benchmark regressed on itself', () => {
    const closes = benchmarkCloses(400)
    const bench = series(closes)

    expect(estimateBeta(alignedDailyReturns(bench, bench))).toBeCloseTo(1, 12)
  })

  it.each([
    ['2x', 2],
    ['0.5x', 0.5],
    ['-1x', -1],
  ])('recovers a synthetic %s series', (_label, beta) => {
    const closes = benchmarkCloses(400)
    const bench = series(closes)
    const asset = series(leveredCloses(closes, beta))

    expect(estimateBeta(alignedDailyReturns(asset, bench))).toBeCloseTo(beta, 6)
  })

  it('is unchanged by a halt, because alignment drops the gap from both', () => {
    const closes = benchmarkCloses(400)
    const bench = series(closes)
    const clean = leveredCloses(closes, 1.5)

    const halted: (number | null)[] = [...clean]
    halted[200] = null

    const withoutHalt = estimateBeta(alignedDailyReturns(series(clean), bench))
    const withHalt = estimateBeta(alignedDailyReturns(series(halted), bench))

    expect(withHalt).toBeCloseTo(withoutHalt as number, 3)
  })

  it('returns null with too few paired observations to fit', () => {
    const closes = benchmarkCloses(50)
    const bench = series(closes)
    const asset = series(leveredCloses(closes, 1.2))

    expect(estimateBeta(alignedDailyReturns(asset, bench))).toBeNull()
  })

  it('returns null when the benchmark never moves', () => {
    const flat = series(new Array(400).fill(100))
    const asset = series(benchmarkCloses(400))

    expect(estimateBeta(alignedDailyReturns(asset, flat))).toBeNull()
  })
})

describe('calculateResidualReturn', () => {
  it('is zero for a stock that simply tracks the market', () => {
    const closes = benchmarkCloses(500)
    const bench = series(closes)
    const asset = series(leveredCloses(closes, 1))

    // Beta 1 and no drift: the market's move accounts for all of it.
    expect(calculateResidualReturn(asset, bench, TWELVE_ONE)).toBeCloseTo(0, 9)
  })

  it('leaves only a small compounding residue for a levered tracker', () => {
    const closes = benchmarkCloses(500)
    const bench = series(closes)
    const asset = series(leveredCloses(closes, 1.8))
    const market = calculateResidualReturn(bench, bench, TWELVE_ONE)

    const residual = calculateResidualReturn(asset, bench, TWELVE_ONE) as number

    // Levering daily returns by beta does not lever the *compounded* return
    // by beta, so subtracting beta x the market's total return cannot reach
    // exactly zero. The leftover is convexity, and it stays second-order.
    expect(market).toBeCloseTo(0, 9)
    expect(Math.abs(residual)).toBeLessThan(0.05)
  })

  it('keeps persistent stock-specific outperformance in the number', () => {
    const closes = benchmarkCloses(500)
    const bench = series(closes)
    const levered = leveredCloses(closes, 1.0)
    // The same beta-1 path, plus a steady extra 0.05% a day.
    const outperformer = levered.map((c, i) => c * 1.0005 ** i)

    const residual = calculateResidualReturn(
      series(outperformer),
      bench,
      TWELVE_ONE,
    ) as number

    // Subtracting the fitted intercept would drive this to ~0; it must not.
    expect(residual).toBeGreaterThan(0.05)
  })

  it('is negative for a stock that lagged its beta-implied return', () => {
    const closes = benchmarkCloses(500)
    const bench = series(closes)
    const levered = leveredCloses(closes, 1.0)
    const laggard = levered.map((c, i) => c * 0.9995 ** i)

    expect(
      calculateResidualReturn(series(laggard), bench, TWELVE_ONE) as number,
    ).toBeLessThan(0)
  })

  it('returns null when beta cannot be estimated', () => {
    const closes = benchmarkCloses(60)
    const bench = series(closes)
    const asset = series(leveredCloses(closes, 1.2))

    expect(calculateResidualReturn(asset, bench, TWELVE_ONE)).toBeNull()
  })

  it('returns null when the stock cannot cover the window', () => {
    const closes = benchmarkCloses(500)
    const bench = series(closes)
    // Listed only for the final stretch: plenty of paired days, no 12 months.
    const late = new Array(500).fill(null)
    for (let i = 260; i < 500; i++) late[i] = 100 + i
    expect(calculateResidualReturn(series(late), bench, TWELVE_ONE)).toBeNull()
  })
})
