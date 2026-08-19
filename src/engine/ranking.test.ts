import { describe, expect, it } from 'vitest'
import { rank, rankChange } from './ranking.ts'

interface Row {
  ticker: string
  value: number | null
}

const id = (r: Row) => r.ticker
const val = (r: Row) => r.value

describe('rank', () => {
  const rows: Row[] = [
    { ticker: 'AAA', value: 0.1 },
    { ticker: 'BBB', value: 0.5 },
    { ticker: 'CCC', value: -0.2 },
  ]

  it('orders descending by default', () => {
    expect(rank(rows, id, val).ranked.map((r) => r.item.ticker)).toEqual(['BBB', 'AAA', 'CCC'])
  })

  it('orders ascending when the metric asks for it', () => {
    expect(rank(rows, id, val, 'asc').ranked.map((r) => r.item.ticker)).toEqual([
      'CCC',
      'AAA',
      'BBB',
    ])
  })

  it('sets unmeasured names aside instead of ranking them last', () => {
    // Ranking a missing 12−1 as the worst momentum in the universe would be a
    // statement the data does not support.
    const withGap: Row[] = [...rows, { ticker: 'DDD', value: null }]
    const result = rank(withGap, id, val)
    expect(result.ranked).toHaveLength(3)
    expect(result.unranked.map((r) => r.ticker)).toEqual(['DDD'])
    expect(result.rankOf.has('DDD')).toBe(false)
  })

  it('treats NaN and Infinity as unmeasured', () => {
    const dirty: Row[] = [
      { ticker: 'AAA', value: Number.NaN },
      { ticker: 'BBB', value: Number.POSITIVE_INFINITY },
      { ticker: 'CCC', value: 1 },
    ]
    const result = rank(dirty, id, val)
    expect(result.ranked.map((r) => r.item.ticker)).toEqual(['CCC'])
    expect(result.unranked).toHaveLength(2)
  })

  it('gives tied values the same competition rank', () => {
    const tied: Row[] = [
      { ticker: 'AAA', value: 1 },
      { ticker: 'BBB', value: 1 },
      { ticker: 'CCC', value: 0 },
    ]
    const result = rank(tied, id, val)
    expect(result.ranked.map((r) => r.rank)).toEqual([1, 1, 3])
  })

  it('breaks ties by ticker so a rerank never reshuffles equal values', () => {
    const a = rank(
      [
        { ticker: 'ZZZ', value: 1 },
        { ticker: 'AAA', value: 1 },
      ],
      id,
      val,
    )
    const b = rank(
      [
        { ticker: 'AAA', value: 1 },
        { ticker: 'ZZZ', value: 1 },
      ],
      id,
      val,
    )
    expect(a.ranked.map((r) => r.item.ticker)).toEqual(b.ranked.map((r) => r.item.ticker))
  })

  it('handles an empty universe', () => {
    const result = rank([] as Row[], id, val)
    expect(result.ranked).toHaveLength(0)
    expect(result.rankOf.size).toBe(0)
  })
})

describe('rankChange', () => {
  it('reports positions climbed, so improving is positive', () => {
    const before = new Map([['AAA', 10]])
    const after = new Map([['AAA', 3]])
    expect(rankChange(before, after).get('AAA')).toBe(7)
  })

  it('reports positions lost as negative', () => {
    expect(rankChange(new Map([['AAA', 3]]), new Map([['AAA', 10]])).get('AAA')).toBe(-7)
  })

  it('gives no change to a name that was unrankable before', () => {
    // Otherwise a stock that merely accumulated enough history would appear as
    // the biggest climber in the market.
    const change = rankChange(new Map(), new Map([['NEW', 4]]))
    expect(change.has('NEW')).toBe(false)
  })

  it('ignores names that have since dropped out', () => {
    const change = rankChange(new Map([['GONE', 2]]), new Map([['AAA', 1]]))
    expect(change.has('GONE')).toBe(false)
  })
})
