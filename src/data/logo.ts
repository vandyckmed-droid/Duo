/**
 * Resolves a ticker to its logo image.
 *
 * Derived from the ticker rather than stored per stock: the provider serves
 * these at a predictable path, so a generated dataset carries 400 fewer
 * fields and a new constituent needs no extra fetch. Swapping providers, or
 * moving to self-hosted assets, is a change to this one function.
 *
 * Not every ticker resolves — the card falls back to a monogram when the
 * image fails, so a missing logo costs nothing.
 */
export function logoUrl(ticker: string): string {
  return `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(ticker)}.png`
}
