/**
 * The selected basket: tickers with portfolio weights.
 *
 * Weights are stored as fractions and always sum to exactly 1 — every
 * operation renormalises, so "keeping the total at 100%" is a structural
 * property, not a validation rule. Everything here is a pure function from
 * basket to basket; persistence and React wiring live elsewhere.
 *
 * The weighting rules:
 *
 *  - A new name enters at the equal share, 1/n, and everyone else scales down
 *    proportionally to make room. Applied to an untouched basket this keeps
 *    every weight equal, so "start with equal weighting" needs no special
 *    case or dirty flag.
 *  - Editing one weight pins it and rescales the others proportionally into
 *    the remainder, preserving their relative sizes.
 *  - Removing a name rescales the survivors back to 1.
 */

export interface BasketEntry {
  readonly ticker: string
  /** Fraction of the portfolio, in [0, 1]. Entries always sum to 1. */
  readonly weight: number
}

export type Basket = readonly BasketEntry[]

export function inBasket(basket: Basket, ticker: string): boolean {
  return basket.some((e) => e.ticker === ticker)
}

/** Adds at the equal share; a duplicate add is a no-op. */
export function addToBasket(basket: Basket, ticker: string): Basket {
  if (inBasket(basket, ticker)) return basket
  const n = basket.length + 1
  const share = 1 / n
  return normalise([
    ...basket.map((e) => ({ ...e, weight: e.weight * (1 - share) })),
    { ticker, weight: share },
  ])
}

export function removeFromBasket(basket: Basket, ticker: string): Basket {
  const remaining = basket.filter((e) => e.ticker !== ticker)
  if (remaining.length === basket.length) return basket
  return normalise(remaining)
}

export function toggleInBasket(basket: Basket, ticker: string): Basket {
  return inBasket(basket, ticker) ? removeFromBasket(basket, ticker) : addToBasket(basket, ticker)
}

/**
 * Pins one entry's weight and rescales the rest proportionally into what is
 * left. When the others currently hold nothing, the remainder is split
 * equally among them — proportional scaling of zeros has no direction.
 */
export function setWeight(basket: Basket, ticker: string, weight: number): Basket {
  const target = basket.find((e) => e.ticker === ticker)
  if (!target) return basket
  if (basket.length === 1) return [{ ticker, weight: 1 }]

  const pinned = clamp(weight)
  const others = basket.filter((e) => e.ticker !== ticker)
  const othersTotal = others.reduce((sum, e) => sum + e.weight, 0)
  const remainder = 1 - pinned

  const rescaled = others.map((e) => ({
    ...e,
    weight: othersTotal > 0 ? (e.weight / othersTotal) * remainder : remainder / others.length,
  }))
  return basket.map((e) => {
    if (e.ticker === ticker) return { ...e, weight: pinned }
    return rescaled.find((r) => r.ticker === e.ticker) as BasketEntry
  })
}

/** Back to the starting point: every name at 1/n. */
export function equaliseWeights(basket: Basket): Basket {
  if (basket.length === 0) return basket
  return basket.map((e) => ({ ...e, weight: 1 / basket.length }))
}

/**
 * Concentration at a glance: the largest position and the share held by the
 * `top` largest, without a portfolio analytics dashboard.
 */
export function concentration(
  basket: Basket,
  top = 3,
): { largest: BasketEntry | null; topShare: number } {
  if (basket.length === 0) return { largest: null, topShare: 0 }
  const sorted = [...basket].sort((a, b) => b.weight - a.weight)
  return {
    largest: sorted[0] ?? null,
    topShare: sorted.slice(0, top).reduce((sum, e) => sum + e.weight, 0),
  }
}

/** Rescales to an exact sum of 1; an all-zero basket falls back to equal. */
function normalise(entries: readonly BasketEntry[]): Basket {
  if (entries.length === 0) return entries
  const total = entries.reduce((sum, e) => sum + e.weight, 0)
  if (total <= 0) return entries.map((e) => ({ ...e, weight: 1 / entries.length }))
  return entries.map((e) => ({ ...e, weight: e.weight / total }))
}

function clamp(weight: number): number {
  if (!Number.isFinite(weight)) return 0
  return Math.min(1, Math.max(0, weight))
}
