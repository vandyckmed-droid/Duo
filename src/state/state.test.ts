import { describe, expect, it } from 'vitest'
import {
  addToBasket,
  type Basket,
  concentration,
  equaliseWeights,
  removeFromBasket,
  setWeight,
  toggleInBasket,
} from './basket.ts'
import { loadBasket, loadWatchlist, saveBasket, saveWatchlist } from './persistence.ts'

const total = (basket: Basket) => basket.reduce((sum, e) => sum + e.weight, 0)

describe('basket weights', () => {
  it('starts equal and stays equal as names are added', () => {
    let basket = addToBasket([], 'AAA')
    expect(basket).toEqual([{ ticker: 'AAA', weight: 1 }])
    basket = addToBasket(basket, 'BBB')
    basket = addToBasket(basket, 'CCC')
    for (const entry of basket) expect(entry.weight).toBeCloseTo(1 / 3, 12)
    expect(total(basket)).toBeCloseTo(1, 12)
  })

  it('ignores a duplicate add', () => {
    const basket = addToBasket(addToBasket([], 'AAA'), 'AAA')
    expect(basket).toHaveLength(1)
  })

  it('pins an edited weight and rescales the others proportionally', () => {
    let basket: Basket = [
      { ticker: 'AAA', weight: 0.5 },
      { ticker: 'BBB', weight: 0.3 },
      { ticker: 'CCC', weight: 0.2 },
    ]
    basket = setWeight(basket, 'AAA', 0.6)
    expect(basket.find((e) => e.ticker === 'AAA')?.weight).toBeCloseTo(0.6, 12)
    // BBB and CCC keep their 3:2 relationship inside the remaining 40%.
    expect(basket.find((e) => e.ticker === 'BBB')?.weight).toBeCloseTo(0.24, 12)
    expect(basket.find((e) => e.ticker === 'CCC')?.weight).toBeCloseTo(0.16, 12)
    expect(total(basket)).toBeCloseTo(1, 12)
  })

  it('splits the remainder equally when the others hold nothing', () => {
    let basket: Basket = [
      { ticker: 'AAA', weight: 1 },
      { ticker: 'BBB', weight: 0 },
      { ticker: 'CCC', weight: 0 },
    ]
    basket = setWeight(basket, 'AAA', 0.5)
    expect(basket.find((e) => e.ticker === 'BBB')?.weight).toBeCloseTo(0.25, 12)
    expect(basket.find((e) => e.ticker === 'CCC')?.weight).toBeCloseTo(0.25, 12)
  })

  it('clamps edited weights into [0, 1] and keeps a lone name at 100%', () => {
    const pair = setWeight(
      [
        { ticker: 'AAA', weight: 0.5 },
        { ticker: 'BBB', weight: 0.5 },
      ],
      'AAA',
      7,
    )
    expect(pair.find((e) => e.ticker === 'AAA')?.weight).toBe(1)
    expect(total(pair)).toBeCloseTo(1, 12)
    expect(setWeight([{ ticker: 'AAA', weight: 1 }], 'AAA', 0.2)).toEqual([
      { ticker: 'AAA', weight: 1 },
    ])
  })

  it('renormalises after a removal, preserving proportions', () => {
    let basket: Basket = [
      { ticker: 'AAA', weight: 0.5 },
      { ticker: 'BBB', weight: 0.3 },
      { ticker: 'CCC', weight: 0.2 },
    ]
    basket = removeFromBasket(basket, 'AAA')
    expect(basket.find((e) => e.ticker === 'BBB')?.weight).toBeCloseTo(0.6, 12)
    expect(basket.find((e) => e.ticker === 'CCC')?.weight).toBeCloseTo(0.4, 12)
  })

  it('toggles membership and can reset to equal weights', () => {
    let basket = toggleInBasket([], 'AAA')
    basket = toggleInBasket(basket, 'BBB')
    basket = setWeight(basket, 'AAA', 0.9)
    basket = equaliseWeights(basket)
    for (const entry of basket) expect(entry.weight).toBeCloseTo(0.5, 12)
    basket = toggleInBasket(basket, 'AAA')
    expect(basket).toEqual([{ ticker: 'BBB', weight: 1 }])
  })

  it('summarises concentration without a dashboard', () => {
    const basket: Basket = [
      { ticker: 'AAA', weight: 0.4 },
      { ticker: 'BBB', weight: 0.3 },
      { ticker: 'CCC', weight: 0.2 },
      { ticker: 'DDD', weight: 0.1 },
    ]
    const { largest, topShare } = concentration(basket)
    expect(largest?.ticker).toBe('AAA')
    expect(topShare).toBeCloseTo(0.9, 12)
    expect(concentration([])).toEqual({ largest: null, topShare: 0 })
  })
})

function memoryStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

describe('persistence', () => {
  it('round-trips the basket and the watchlist', () => {
    const store = memoryStorage()
    const basket: Basket = [
      { ticker: 'AAA', weight: 0.7 },
      { ticker: 'BRK-B', weight: 0.3 },
    ]
    saveBasket(basket, store)
    saveWatchlist(['NVDA', 'MSFT'], store)
    expect(loadBasket(store)).toEqual(basket)
    expect(loadWatchlist(store)).toEqual(['NVDA', 'MSFT'])
  })

  it('degrades corrupt storage to an empty state', () => {
    const store = memoryStorage()
    store.setItem('duo.basket.v1', '{not json')
    store.setItem('duo.watchlist.v1', '"NVDA"')
    expect(loadBasket(store)).toEqual([])
    expect(loadWatchlist(store)).toEqual([])
    expect(loadBasket(null)).toEqual([])
  })

  it('repairs weights that no longer sum to one', () => {
    const store = memoryStorage()
    store.setItem(
      'duo.basket.v1',
      JSON.stringify([
        { ticker: 'AAA', weight: 2 },
        { ticker: 'BBB', weight: 2 },
        { ticker: 'AAA', weight: 1 },
        { ticker: 'bad ticker!', weight: 1 },
        { ticker: 'CCC', weight: Number.NaN },
      ]),
    )
    const basket = loadBasket(store)
    expect(basket.map((e) => e.ticker)).toEqual(['AAA', 'BBB', 'CCC'])
    expect(total(basket)).toBeCloseTo(1, 12)
    expect(basket.find((e) => e.ticker === 'CCC')?.weight).toBe(0)
  })
})
