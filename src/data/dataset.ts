import type { Manifest, SeriesFile, UniverseFile } from '../domain/dataset.ts'

/**
 * Reading the published dataset.
 *
 * The client fetches static JSON from the same origin it was served from and
 * nothing else. There is no provider client in this bundle, no API key, and no
 * request that browsing can trigger: once `universe.json` has loaded, every
 * control on the ranked list is local arithmetic.
 *
 * Price series are fetched one ticker at a time, only when a chart or a
 * portfolio calculation needs one, and are kept for the session.
 */

const BASE = `${import.meta.env.BASE_URL}data`

export interface Dataset {
  readonly manifest: Manifest
  readonly universe: UniverseFile
}

let datasetPromise: Promise<Dataset> | null = null

export function loadDataset(): Promise<Dataset> {
  datasetPromise ??= (async () => {
    const [manifest, universe] = await Promise.all([
      fetchJson<Manifest>(`${BASE}/manifest.json`),
      fetchJson<UniverseFile>(`${BASE}/universe.json`),
    ])
    return { manifest, universe }
  })()
  return datasetPromise
}

const seriesCache = new Map<string, Promise<SeriesFile | null>>()

/** One ticker's adjusted closes. Resolves to null when there is no file. */
export function loadSeries(ticker: string): Promise<SeriesFile | null> {
  const cached = seriesCache.get(ticker)
  if (cached) return cached
  const promise = fetchJson<SeriesFile>(`${BASE}/series/${encodeURIComponent(ticker)}.json`).catch(
    () => null,
  )
  seriesCache.set(ticker, promise)
  return promise
}

/** Several series at once, for group statistics and portfolio construction. */
export async function loadSeriesMany(tickers: readonly string[]): Promise<Map<string, SeriesFile>> {
  const files = await Promise.all(tickers.map((t) => loadSeries(t)))
  const out = new Map<string, SeriesFile>()
  files.forEach((file, i) => {
    if (file) out.set(tickers[i] as string, file)
  })
  return out
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return (await response.json()) as T
}
