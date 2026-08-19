/**
 * Portfolio-layer entry point.
 *
 * Pure functions over a selection of stocks — weighting today, risk and
 * allocation later. Consumers import from `src/portfolio` only, never from
 * the individual modules.
 */
export {
  calculateInverseVolatilityWeights,
  formatWeight,
} from './weights.ts'
export type { VolatilityInput, WeightedSelection } from './weights.ts'
