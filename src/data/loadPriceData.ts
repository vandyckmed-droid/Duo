import { parseIsoDateToUtc } from '../calculations/index.ts'
import type { PriceData, PriceSeries } from './types.ts'

/** Shape of the generated `public/data/prices.json`. */
interface PricesFile {
  readonly generatedAt: string
  readonly dates: readonly string[]
  readonly series: Readonly<Record<string, readonly (number | null)[]>>
}

/**
 * Loads and validates the generated price dataset.
 *
 * The calendar is parsed once here, into the shared timestamp index every
 * series points at. Validating that the index is strictly ascending at the
 * boundary is what lets the calculation layer binary-search it: the ordering
 * guarantee is established once, on the way in, rather than re-derived on
 * every lookup.
 *
 * Throws on a malformed file rather than returning a half-built dataset —
 * a broken build artifact should surface, not silently rank nothing.
 */
export async function loadPriceData(url: string): Promise<PriceData> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Price data request failed: ${response.status}`)
  }

  return parsePriceData((await response.json()) as PricesFile)
}

export function parsePriceData(file: PricesFile): PriceData {
  if (!Array.isArray(file?.dates) || typeof file?.series !== 'object') {
    throw new Error('Price data is malformed')
  }

  const timestamps = file.dates.map((date) => {
    const timestamp = parseIsoDateToUtc(date)
    if (timestamp === null) {
      throw new Error(`Price data has an unusable date: ${date}`)
    }
    return timestamp
  })

  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] <= timestamps[i - 1]) {
      throw new Error(`Price data dates are not ascending at ${file.dates[i]}`)
    }
  }

  const series: Record<string, PriceSeries> = {}
  for (const [ticker, closes] of Object.entries(file.series)) {
    if (closes.length !== timestamps.length) {
      throw new Error(`Price data for ${ticker} does not match the calendar`)
    }
    series[ticker] = { timestamps, closes }
  }

  return { generatedAt: file.generatedAt, timestamps, series }
}
