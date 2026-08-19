import { portfolioVolatility, toCorrelation } from './covariance.ts'

/**
 * Hierarchical Risk Parity.
 *
 * Three steps, each of which can be read on its own:
 *
 *  1. Turn correlations into distances — `d = √((1 − ρ)/2)` — so that names
 *     that move together sit close to each other.
 *  2. Cluster them bottom-up, repeatedly merging the two closest groups, and
 *     order the leaves so that neighbours in the list are neighbours in the
 *     tree. This is the quasi-diagonalisation step.
 *  3. Walk the tree from the top, splitting capital between each pair of
 *     branches in inverse proportion to the risk of each branch.
 *
 * No matrix is inverted anywhere. That is the point: mean-variance optimisers
 * invert a covariance matrix estimated from a few hundred noisy days, and the
 * inverse amplifies exactly the errors the estimate is worst at. HRP only ever
 * compares one group's risk to another's, which is a question the data can
 * answer.
 */

export interface Cluster {
  readonly id: number
  readonly left: Cluster | null
  readonly right: Cluster | null
  readonly leaf: number | null
  readonly distance: number
}

/** Correlation distance: 0 for perfectly correlated, 1 for perfectly opposed. */
export function correlationDistance(correlation: readonly (readonly number[])[]): number[][] {
  return correlation.map((row, i) =>
    row.map((rho, j) => (i === j ? 0 : Math.sqrt(Math.max(0, (1 - rho) / 2)))),
  )
}

/**
 * Single-linkage agglomerative clustering over a distance matrix.
 *
 * Single linkage — the distance between two clusters is the distance between
 * their closest members — keeps the merge order driven by the strongest
 * pairwise relationships rather than by cluster size.
 */
export function cluster(distance: readonly (readonly number[])[]): Cluster | null {
  const n = distance.length
  if (n === 0) return null
  let nextId = n
  let active: Cluster[] = Array.from({ length: n }, (_, i) => ({
    id: i,
    left: null,
    right: null,
    leaf: i,
    distance: 0,
  }))
  const members = new Map<number, number[]>(active.map((c) => [c.id, [c.leaf as number]]))

  while (active.length > 1) {
    let best = Number.POSITIVE_INFINITY
    let bi = 0
    let bj = 1
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const d = linkage(
          distance,
          members.get((active[i] as Cluster).id) as number[],
          members.get((active[j] as Cluster).id) as number[],
        )
        if (d < best) {
          best = d
          bi = i
          bj = j
        }
      }
    }
    const left = active[bi] as Cluster
    const right = active[bj] as Cluster
    const merged: Cluster = { id: nextId++, left, right, leaf: null, distance: best }
    members.set(merged.id, [
      ...(members.get(left.id) as number[]),
      ...(members.get(right.id) as number[]),
    ])
    active = active.filter((_, k) => k !== bi && k !== bj)
    active.push(merged)
  }
  return active[0] as Cluster
}

function linkage(
  distance: readonly (readonly number[])[],
  a: readonly number[],
  b: readonly number[],
): number {
  let min = Number.POSITIVE_INFINITY
  for (const i of a) {
    for (const j of b) {
      const d = (distance[i] as readonly number[])[j] as number
      if (d < min) min = d
    }
  }
  return min
}

/** Leaves in tree order — the quasi-diagonalisation. */
export function quasiDiagonal(root: Cluster | null): number[] {
  if (!root) return []
  if (root.leaf !== null) return [root.leaf]
  return [...quasiDiagonal(root.left), ...quasiDiagonal(root.right)]
}

/**
 * Recursive bisection: split the ordered leaves in half, weight each half by
 * the inverse of its own variance, and recurse.
 */
export function recursiveBisection(
  order: readonly number[],
  covariance: readonly (readonly number[])[],
): number[] {
  const weights = Array.from({ length: covariance.length }, () => 0)
  const stack: number[][] = [[...order]]
  const allocation = new Map<string, number>()
  allocation.set(key(order), 1)

  while (stack.length) {
    const group = stack.pop() as number[]
    const share = allocation.get(key(group)) ?? 0
    if (group.length === 1) {
      weights[group[0] as number] = share
      continue
    }
    const half = Math.floor(group.length / 2)
    const left = group.slice(0, half)
    const right = group.slice(half)
    const vLeft = clusterVariance(left, covariance)
    const vRight = clusterVariance(right, covariance)
    const total = vLeft + vRight
    // Both halves risk-free is not a real state; splitting evenly is the only
    // answer that does not divide by zero or invent a preference.
    const alpha = total <= 1e-18 ? 0.5 : 1 - vLeft / total
    allocation.set(key(left), share * alpha)
    allocation.set(key(right), share * (1 - alpha))
    stack.push(left, right)
  }
  return weights
}

const key = (group: readonly number[]) => group.join(',')

/** Variance of a sub-group weighted inverse to each member's own variance. */
function clusterVariance(
  group: readonly number[],
  covariance: readonly (readonly number[])[],
): number {
  const inv = group.map((i) => {
    const v = (covariance[i] as readonly number[])[i] as number
    return v <= 1e-18 ? 0 : 1 / v
  })
  const total = inv.reduce((a, b) => a + b, 0)
  const w = total <= 1e-18 ? group.map(() => 1 / group.length) : inv.map((x) => x / total)
  const sub = group.map((i) => group.map((j) => (covariance[i] as readonly number[])[j] as number))
  return portfolioVolatility(w, sub) ** 2
}

/** End-to-end HRP weights for a covariance matrix, in input order. */
export function hrpWeights(covariance: readonly (readonly number[])[]): number[] {
  const n = covariance.length
  if (n === 0) return []
  if (n === 1) return [1]
  const order = quasiDiagonal(cluster(correlationDistance(toCorrelation(covariance))))
  const weights = recursiveBisection(order, covariance)
  const total = weights.reduce((a, b) => a + b, 0)
  return total <= 1e-18 ? weights.map(() => 1 / n) : weights.map((w) => w / total)
}
