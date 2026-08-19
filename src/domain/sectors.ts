/**
 * Canonical GICS sectors.
 *
 * The universe arrives classified by two different vocabularies. Financial
 * Modeling Prep labels the S&P 500 in a Yahoo-derived scheme ("Technology",
 * "Financial Services", "Healthcare"); the index constituents tables use GICS
 * proper ("Information Technology", "Financials", "Health Care").
 *
 * Left alone, the two produce seventeen sectors instead of eleven, and the
 * sector filter quietly stops composing with the segment filter: choosing
 * Financials would show the 400 and the 600 and silently omit every large-cap
 * bank. So every provider label is mapped onto one canonical GICS name here,
 * once, before anything downstream sees it.
 */

export const GICS_SECTORS = [
  'Communication Services',
  'Consumer Discretionary',
  'Consumer Staples',
  'Energy',
  'Financials',
  'Health Care',
  'Industrials',
  'Information Technology',
  'Materials',
  'Real Estate',
  'Utilities',
] as const

export type GicsSector = (typeof GICS_SECTORS)[number] | 'Unknown'

/** Provider labels that mean a GICS sector under a different name. */
const ALIASES: Record<string, GicsSector> = {
  'basic materials': 'Materials',
  'consumer cyclical': 'Consumer Discretionary',
  'consumer defensive': 'Consumer Staples',
  'financial services': 'Financials',
  financial: 'Financials',
  healthcare: 'Health Care',
  technology: 'Information Technology',
  'information technology': 'Information Technology',
  'communication services': 'Communication Services',
  'telecommunication services': 'Communication Services',
  'consumer discretionary': 'Consumer Discretionary',
  'consumer staples': 'Consumer Staples',
  'health care': 'Health Care',
  financials: 'Financials',
  materials: 'Materials',
  energy: 'Energy',
  industrials: 'Industrials',
  'real estate': 'Real Estate',
  utilities: 'Utilities',
}

/**
 * Maps a provider's sector label onto its canonical GICS name.
 *
 * An unrecognised label becomes `Unknown` rather than being passed through.
 * Passing it through would add a phantom sector to the filter that holds a
 * handful of names and looks like a real category.
 */
export function canonicalSector(raw: string | null | undefined): GicsSector {
  if (!raw) return 'Unknown'
  return ALIASES[raw.trim().toLowerCase()] ?? 'Unknown'
}
