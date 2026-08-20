import type { SignalId, WindowSpec } from '../domain/dataset.ts'
import { type Closes, dailyReturns, endpointAt, lastValidIndex } from './series.ts'

/**
 * The per-security ranking signals: volatility-adjusted momentum.
 *
 * Each signal is one window measured backwards from a shared anchor — the
 * dataset's last trading day, the same day for every security. If a name whose
 * feed stopped two weeks ago were measured from its own last close, its
 * "12-month return" would cover a different year than everyone else's and rank
 * against them as though it did not.
 *
 * Adding a horizon is adding an entry to `SIGNAL_WINDOWS`. Nothing downstream
 * branches on which window it is holding.
 */

export const TRADING_DAYS_PER_YEAR = 252

/**
 * The V1 windows, in trading days.
 *
 * The skipped month is the "−1": short-horizon reversal dominates the most
 * recent few weeks, so including them would measure the reversal rather than
 * the momentum. The skip stays at 21 days while the formation halves, because
 * reversal operates over the same few weeks regardless of formation length.
 */
export const SIGNAL_WINDOWS: Readonly<Record<SignalId, WindowSpec>> = {
  '12-1': { formation: 252, skip: 21 },
  '6-1': { formation: 126, skip: 21 },
}

export const SIGNAL_IDS: readonly SignalId[] = Object.keys(SIGNAL_WINDOWS)

/**
 * Minimum share of a window that must contain real daily returns.
 *
 * Below this the estimate is being formed from a different, shorter sample
 * than the one it is labelled with, which makes it incomparable to the rest of
 * the ranking — and comparability is the whole point of the number.
 */
export const MIN_COVERAGE = 0.6

/**
 * Return over a trading-day window:
 *
 *     … ── start ────── formation ────── end ── skip ── evaluated at
 *
 * Null when the start target falls off the front of the calendar: no amount of
 * endpoint tolerance makes the window the length it claims to be, and a
 * shorter window silently substituted here would rank a six-month-old listing
 * against a full year of everyone else.
 */
export function windowReturn(closes: Closes, window: WindowSpec, evaluatedAt?: number): number | null {
  const anchor = evaluatedAt ?? lastValidIndex(closes)
  if (anchor < 0) return null

  const endTarget = anchor - window.skip
  const startTarget = endTarget - window.formation
  if (startTarget < 0) return null

  const end = endpointAt(closes, endTarget)
  if (!end) return null
  const start = endpointAt(closes, startTarget)
  if (!start) return null
  // Tolerance may pull both endpoints back; onto the same day the "return"
  // would be exactly zero by construction.
  if (end.index <= start.index) return null

  return end.close / start.close - 1
}

/**
 * Annualised volatility of daily simple returns over a window's formation
 * span — the same trading days the window's return covers, so numerator and
 * denominator of return-per-volatility always describe the same period.
 *
 * Simple rather than log returns, so that this volatility and the return it
 * divides are built from the same quantity.
 */
export function formationVolatility(
  closes: Closes,
  window: WindowSpec,
  evaluatedAt?: number,
): number | null {
  const anchor = evaluatedAt ?? lastValidIndex(closes)
  if (anchor < 0) return null
  const to = anchor - window.skip
  const from = to - window.formation + 1
  if (from < 1) return null

  const returns = dailyReturns(closes)
  const sample: number[] = []
  for (let i = from; i <= to; i++) {
    const r = returns[i]
    if (r !== null && r !== undefined) sample.push(r)
  }
  if (sample.length < Math.ceil(window.formation * MIN_COVERAGE)) return null
  if (sample.length < 2) return null

  const average = sample.reduce((a, b) => a + b, 0) / sample.length
  let sq = 0
  for (const r of sample) sq += (r - average) ** 2
  const sd = Math.sqrt(sq / (sample.length - 1))
  return sd * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

/**
 * One signal value: window return per unit of formation-window volatility.
 *
 * Deliberately not a Sharpe ratio — no risk-free rate is subtracted, because
 * this exists to make two names comparable, not to price them. A negative
 * return stays negative and stays ranked last, which is the behaviour the
 * list wants. A genuinely zero-volatility series is a stale or halted feed,
 * not a risk-free stock; dividing by it would mint an infinite score.
 */
export function momentumSignal(closes: Closes, window: WindowSpec, evaluatedAt?: number): number | null {
  const totalReturn = windowReturn(closes, window, evaluatedAt)
  if (totalReturn === null) return null
  const volatility = formationVolatility(closes, window, evaluatedAt)
  if (volatility === null || volatility <= 1e-9) return null
  return totalReturn / volatility
}
