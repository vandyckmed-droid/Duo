import { useEffect, useMemo, useState } from 'react'
import type { UniverseFile } from '../domain/dataset.ts'
import {
  type Basket,
  equaliseWeights,
  removeFromBasket,
  setWeight,
  toggleInBasket,
} from '../state/basket.ts'
import { loadBasket, loadWatchlist, saveBasket, saveWatchlist } from '../state/persistence.ts'

/**
 * React bindings for the state layer. All the arithmetic lives in pure
 * modules; these hooks only hold the current value and persist it.
 */

export type DatasetState =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly universe: UniverseFile }

/**
 * Loads `data/universe.json`, published next to the app by the pipeline.
 *
 * A 404 is a real state, not an error: a fresh deployment serves the app
 * before the first scheduled refresh has published a dataset.
 */
export function useDataset(): DatasetState {
  const [state, setState] = useState<DatasetState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/universe.json`, {
          cache: 'no-cache',
        })
        if (response.status === 404) {
          if (!cancelled) setState({ status: 'missing' })
          return
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const universe = (await response.json()) as UniverseFile
        if (!Array.isArray(universe?.securities) || typeof universe?.asOf !== 'string') {
          throw new Error('malformed universe')
        }
        if (!cancelled) setState({ status: 'ready', universe })
      } catch {
        if (!cancelled) setState({ status: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export interface BasketStore {
  readonly basket: Basket
  readonly tickers: ReadonlySet<string>
  toggle(ticker: string): void
  remove(ticker: string): void
  reweight(ticker: string, weight: number): void
  equalise(): void
}

export function useBasket(): BasketStore {
  const [basket, setBasket] = useState<Basket>(loadBasket)
  useEffect(() => saveBasket(basket), [basket])
  const tickers = useMemo(() => new Set(basket.map((e) => e.ticker)), [basket])
  return useMemo(
    () => ({
      basket,
      tickers,
      toggle: (ticker) => setBasket((b) => toggleInBasket(b, ticker)),
      remove: (ticker) => setBasket((b) => removeFromBasket(b, ticker)),
      reweight: (ticker, weight) => setBasket((b) => setWeight(b, ticker, weight)),
      equalise: () => setBasket((b) => equaliseWeights(b)),
    }),
    [basket, tickers],
  )
}

export interface WatchlistStore {
  readonly tickers: ReadonlySet<string>
  readonly ordered: readonly string[]
  toggle(ticker: string): void
}

export function useWatchlist(): WatchlistStore {
  const [ordered, setOrdered] = useState<readonly string[]>(loadWatchlist)
  useEffect(() => saveWatchlist(ordered), [ordered])
  const tickers = useMemo(() => new Set(ordered), [ordered])
  return useMemo(
    () => ({
      tickers,
      ordered,
      toggle: (ticker) =>
        setOrdered((current) =>
          current.includes(ticker) ? current.filter((t) => t !== ticker) : [...current, ticker],
        ),
    }),
    [ordered, tickers],
  )
}
