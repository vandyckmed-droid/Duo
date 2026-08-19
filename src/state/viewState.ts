import { DEFAULT_SCREEN, type Screen } from '../domain/screen.ts'
import { isMetricId } from '../domain/metrics.ts'
import { isSegment } from '../domain/segments.ts'

/**
 * State that survives a reload.
 *
 * Coming back to the app should feel like returning to a page you left open,
 * not like starting over: the same metric, the same filters, the same
 * watchlist, the same ticker open, and the list roughly where you left it.
 *
 * Everything is validated on the way in. A metric id that no longer exists,
 * or a hand-edited value, falls back to the default rather than rendering an
 * empty list that looks like missing data.
 */

const KEY = 'duo.state.v1'

export type Tab = 'ranked' | 'watchlist' | 'portfolio' | 'settings'
export type Scheme = 'equal' | 'inverse-vol' | 'hrp'
export type PortfolioSource = 'leaders' | 'watchlist'

/** Default cash total for the portfolio view, in dollars. Adjustable in place. */
export const DEFAULT_PORTFOLIO_VALUE = 30_000

export interface ViewState {
  readonly screen: Screen
  readonly tab: Tab
  readonly watchlist: readonly string[]
  /** Ticker whose detail view is open, if any. */
  readonly open: string | null
  readonly scrollTop: number
  readonly scheme: Scheme
  readonly capPerHolding: number | null
  readonly capPerSector: number | null
  /** What the portfolio is built from: sector leaders or the watchlist. */
  readonly portfolioSource: PortfolioSource
  /** Cash total the weights are expressed in, whole dollars. */
  readonly portfolioValue: number
}

export const INITIAL: ViewState = {
  screen: DEFAULT_SCREEN,
  tab: 'ranked',
  watchlist: [],
  open: null,
  scrollTop: 0,
  scheme: 'inverse-vol',
  capPerHolding: null,
  capPerSector: null,
  portfolioSource: 'leaders',
  portfolioValue: DEFAULT_PORTFOLIO_VALUE,
}

export function load(): ViewState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return INITIAL
    return sanitise(JSON.parse(raw) as Partial<ViewState>)
  } catch {
    return INITIAL
  }
}

export function save(state: ViewState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // A full or disabled store costs persistence, never the session.
  }
}

export function sanitise(input: Partial<ViewState> | null | undefined): ViewState {
  if (!input || typeof input !== 'object') return INITIAL
  const screen = (input.screen ?? {}) as Partial<Screen>
  const segment = typeof screen.segment === 'string' && isSegment(screen.segment) ? screen.segment : null

  return {
    screen: {
      metricId:
        typeof screen.metricId === 'string' && isMetricId(screen.metricId)
          ? screen.metricId
          : DEFAULT_SCREEN.metricId,
      segment,
      sector: typeof screen.sector === 'string' && screen.sector ? screen.sector : null,
      watchlistOnly: screen.watchlistOnly === true,
      invert: screen.invert === true,
      query: typeof screen.query === 'string' ? screen.query.slice(0, 40) : '',
    },
    tab: isTab(input.tab) ? input.tab : 'ranked',
    watchlist: Array.isArray(input.watchlist)
      ? [...new Set(input.watchlist.filter((t): t is string => typeof t === 'string' && !!t))]
      : [],
    open: typeof input.open === 'string' && input.open ? input.open : null,
    scrollTop: Number.isFinite(input.scrollTop) ? Math.max(0, Number(input.scrollTop)) : 0,
    scheme: isScheme(input.scheme) ? input.scheme : 'inverse-vol',
    capPerHolding: capOrNull(input.capPerHolding),
    capPerSector: capOrNull(input.capPerSector),
    portfolioSource: input.portfolioSource === 'watchlist' ? 'watchlist' : 'leaders',
    portfolioValue: valueOrDefault(input.portfolioValue),
  }
}

const isTab = (v: unknown): v is Tab =>
  v === 'ranked' || v === 'watchlist' || v === 'portfolio' || v === 'settings'

const isScheme = (v: unknown): v is Scheme =>
  v === 'equal' || v === 'inverse-vol' || v === 'hrp'

const capOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1 ? v : null

/** A hand-edited or stale value falls back rather than dividing $NaN. */
const valueOrDefault = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 1e9
    ? Math.round(v)
    : DEFAULT_PORTFOLIO_VALUE

/** Adds or removes a ticker, preserving the order names were added in. */
export function toggleWatch(watchlist: readonly string[], ticker: string): string[] {
  return watchlist.includes(ticker)
    ? watchlist.filter((t) => t !== ticker)
    : [...watchlist, ticker]
}
