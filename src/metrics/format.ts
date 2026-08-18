/**
 * Renders a fractional return as a signed percentage: `0.2413` → `+24.1%`.
 *
 * The explicit `+` matters on a ranked list — with signs on both ends, up
 * and down are told apart at a glance rather than by reading digits.
 */
export function formatPercent(value: number): string {
  const percent = value * 100
  const sign = percent > 0 ? '+' : ''

  return `${sign}${percent.toFixed(1)}%`
}

/** Renders a plain ratio, such as a beta: `1.2837` → `1.28`. */
export function formatRatio(value: number): string {
  return value.toFixed(2)
}
