/**
 * The set of selected tickers, and its persistence.
 *
 * Selection is independent of the current metric or sector filter — neither
 * clears it — so it is kept as its own piece of state rather than derived
 * from the ranking. Persisted under its own key so a page reload restores
 * the same picks.
 */

const STORAGE_KEY = 'duo:selection'

/**
 * The minimal shape `readSelection`/`writeSelection` need. Narrower than the
 * DOM `Storage` type on purpose: it is what makes the pure functions here
 * testable with a plain object instead of a browser environment, while
 * `window.localStorage` still satisfies it structurally.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * Reads the persisted selection.
 *
 * Returns an empty set for anything that isn't a clean array of strings —
 * absent, corrupted by another script, or edited by hand. A broken selection
 * should fail back to nothing selected, not crash the page.
 */
export function readSelection(storage: KeyValueStorage): ReadonlySet<string> {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return new Set()

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()

    return new Set(parsed.filter((item): item is string => typeof item === 'string'))
  } catch {
    return new Set()
  }
}

/**
 * Persists the selection.
 *
 * Failures — private browsing, storage quota, a disabled API — are silently
 * ignored. Selection still works for the rest of the session; only carrying
 * it to the next visit is lost, which is not worth surfacing an error for.
 */
export function writeSelection(
  storage: KeyValueStorage,
  selection: ReadonlySet<string>,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...selection]))
  } catch {
    // Best-effort persistence; the in-memory selection is unaffected.
  }
}

/** Returns a new set with `ticker` toggled in or out of `selection`. */
export function toggleSelection(
  selection: ReadonlySet<string>,
  ticker: string,
): ReadonlySet<string> {
  const next = new Set(selection)
  if (next.has(ticker)) {
    next.delete(ticker)
  } else {
    next.add(ticker)
  }
  return next
}
