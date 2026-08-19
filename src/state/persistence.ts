import type { Basket, BasketEntry } from './basket.ts'

/**
 * Local persistence for the basket and the watchlist.
 *
 * Storage is treated as untrusted input: everything read back is validated
 * and renormalised, so a corrupt or hand-edited value degrades to an empty
 * state rather than propagating NaN weights into the portfolio view. Tickers
 * are kept even when a name has dropped out of the current dataset — the
 * universe changes underneath a saved basket, and silently deleting a
 * position would be worse than showing it as unavailable.
 */

const BASKET_KEY = 'duo.basket.v1'
const WATCHLIST_KEY = 'duo.watchlist.v1'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function storage(): StorageLike | null {
  try {
    return globalThis.localStorage
  } catch {
    // Storage can throw when disabled (private browsing policies, embeds).
    return null
  }
}

const isTicker = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z0-9.-]{1,8}$/.test(value)

export function loadBasket(store: StorageLike | null = storage()): Basket {
  try {
    const raw = store?.getItem(BASKET_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const entries: BasketEntry[] = []
    const seen = new Set<string>()
    for (const row of parsed) {
      const ticker: unknown = (row as { ticker?: unknown })?.ticker
      const weight: unknown = (row as { weight?: unknown })?.weight
      if (!isTicker(ticker) || seen.has(ticker)) continue
      seen.add(ticker)
      entries.push({
        ticker,
        weight: typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 0,
      })
    }
    if (entries.length === 0) return []
    const total = entries.reduce((sum, e) => sum + e.weight, 0)
    return total > 0
      ? entries.map((e) => ({ ...e, weight: e.weight / total }))
      : entries.map((e) => ({ ...e, weight: 1 / entries.length }))
  } catch {
    return []
  }
}

export function saveBasket(basket: Basket, store: StorageLike | null = storage()): void {
  try {
    store?.setItem(BASKET_KEY, JSON.stringify(basket))
  } catch {
    // Full or unavailable storage loses persistence, never the session state.
  }
}

export function loadWatchlist(store: StorageLike | null = storage()): string[] {
  try {
    const raw = store?.getItem(WATCHLIST_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter(isTicker))]
  } catch {
    return []
  }
}

export function saveWatchlist(
  tickers: readonly string[],
  store: StorageLike | null = storage(),
): void {
  try {
    store?.setItem(WATCHLIST_KEY, JSON.stringify(tickers))
  } catch {
    // Same policy as the basket: persistence is best-effort.
  }
}
