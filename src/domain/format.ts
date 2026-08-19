/**
 * Number presentation.
 *
 * Two rules run through all of it. Unavailable is rendered as an em dash and
 * never as zero, because a name with no beta is not a name with a beta of
 * zero. And every number carries a fixed number of decimals so that a column
 * of them lines up on the decimal point and can be scanned vertically without
 * reading any of them.
 */

export const EMPTY = '—'

export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY
  return `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(digits)}%`
}

/** Percentages that are magnitudes, not changes: volatility, drawdown depth. */
export function percentPlain(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY
  return `${(value * 100).toFixed(digits)}%`
}

export function ratio(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY
  return value.toFixed(digits)
}

export function signedRatio(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`
}

export function integer(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY
  return Math.round(value).toLocaleString('en-US')
}

export function signedInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY
  const n = Math.round(value)
  if (n === 0) return '0'
  return `${n > 0 ? '+' : '−'}${Math.abs(n)}`
}

/** Whole dollars with a sign the way a brokerage statement writes them. */
export function cash(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY
  return `$${Math.round(value).toLocaleString('en-US')}`
}

export function price(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Market cap in the units people actually say out loud. */
export function marketCap(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return EMPTY
  const trillion = 1e12
  const billion = 1e9
  const million = 1e6
  if (value >= trillion) return `$${(value / trillion).toFixed(2)}T`
  if (value >= billion) return `$${(value / billion).toFixed(value / billion >= 100 ? 0 : 1)}B`
  return `$${(value / million).toFixed(0)}M`
}

/** −1 / 0 / +1, for colouring a value by its sign. */
export function sign(value: number | null | undefined): -1 | 0 | 1 {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 0
  return value > 0 ? 1 : -1
}

/** `2026-08-18` → `18 Aug 2026`. */
export function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return EMPTY
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${Number(d)} ${months[Number(m) - 1] ?? m} ${y}`
}
