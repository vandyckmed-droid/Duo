/** Display formatting. Typography-grade signs: U+2212 minus, thin spacing. */

const MINUS = '−'

/** Blended momentum score: signed, two decimals, real minus sign. */
export function formatScore(value: number): string {
  const rounded = Math.abs(value).toFixed(2)
  return value < -0.005 ? `${MINUS}${rounded}` : `+${rounded}`
}

/** A portfolio weight fraction as a percentage with one decimal. */
export function formatWeight(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

/** A whole-percent share for the concentration line. */
export function formatShare(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

/** Adjusted close for the range endpoints — compact above $1,000. */
export function formatPrice(value: number): string {
  if (value >= 10_000) return Math.round(value).toLocaleString('en-US')
  if (value >= 1_000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return value.toFixed(2)
}

/** `2026-08-18` → `Aug 18, 2026`. */
export function formatAsOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (!y || !m || !d) return iso
  return `${months[m - 1]} ${d}, ${y}`
}
