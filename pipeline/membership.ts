import type { Fmp } from './fmp.ts'
import type { Provenance } from '../src/domain/dataset.ts'
import { canonicalSector } from '../src/domain/sectors.ts'
import { SEGMENTS, type Segment } from '../src/domain/segments.ts'

/**
 * Segment membership.
 *
 * Which names belong to the 500, the 400 and the 600 is the one fact the rest
 * of the pipeline cannot derive for itself, and it decides which benchmark
 * every beta and residual return is measured against. So it is resolved
 * explicitly, in a fixed order of preference, and the route that actually
 * answered is recorded in the published manifest.
 *
 * The order, per the product's own preference for provider-native data:
 *
 *   1. An FMP constituent endpoint for the index.
 *   2. FMP's ETF holdings endpoint for the segment's benchmark.
 *   3. The Wikipedia constituents table for the index.
 *
 * Verified against the live API on 19 August 2026:
 *
 *   - `sp500-constituent` — available; used for the 500, with GICS sector and
 *     sub-industry included.
 *   - `sp400-constituent`, `sp600-constituent`, `index-constituent` — 404. FMP
 *     publishes no constituent endpoint for the MidCap 400 or SmallCap 600.
 *   - `etf/holdings` — HTTP 402 on this subscription for IJH and IJR alike, so
 *     the documented ETF-holdings route cannot supply them either.
 *
 * The 400 and 600 therefore resolve to route 3 today. Routes 1 and 2 are still
 * attempted first on every run: if the subscription gains ETF holdings, the
 * pipeline switches to it by itself and the manifest starts saying so, with no
 * code change.
 */

export interface Member {
  readonly ticker: string
  readonly name: string
  readonly segment: Segment
  readonly sector: string
  readonly industry: string
}

export interface MembershipResult {
  readonly members: Member[]
  readonly provenance: Provenance[]
}

/** FMP writes class shares with a hyphen; the index lists use a dot. */
export function normaliseTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\./g, '-')
}

const WIKIPEDIA: Record<Segment, string> = {
  '500': 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies',
  '400': 'https://en.wikipedia.org/wiki/List_of_S%26P_400_companies',
  '600': 'https://en.wikipedia.org/wiki/List_of_S%26P_600_companies',
}

/** The smallest plausible size for each index; below it the parse is wrong. */
const MINIMUM: Record<Segment, number> = { '500': 450, '400': 350, '600': 500 }

export async function resolveMembership(fmp: Fmp, log = console.log): Promise<MembershipResult> {
  const members: Member[] = []
  const provenance: Provenance[] = []

  for (const segment of SEGMENTS) {
    const resolved = await resolveSegment(fmp, segment.id, log)
    if (resolved.members.length < (MINIMUM[segment.id] as number)) {
      // A half-parsed index is worse than a failed run: it publishes a ranking
      // that silently omits hundreds of names while looking complete.
      throw new Error(
        `${segment.indexName}: resolved only ${resolved.members.length} members via ${resolved.source}, expected at least ${MINIMUM[segment.id]}`,
      )
    }
    members.push(...resolved.members)
    provenance.push({
      segment: segment.id,
      source: resolved.source,
      detail: resolved.detail,
      count: resolved.members.length,
    })
    log(`  ${segment.indexName}: ${resolved.members.length} members via ${resolved.source}`)
  }

  return { members, provenance }
}

async function resolveSegment(
  fmp: Fmp,
  segment: Segment,
  log: (m: string) => void,
): Promise<{ members: Member[]; source: string; detail: string }> {
  // Route 1 — a provider-native constituent endpoint.
  if (segment === '500') {
    const rows = await fmp.sp500Constituents()
    if (rows.length > 0) {
      return {
        members: rows.map((r) => ({
          ticker: normaliseTicker(r.symbol),
          name: r.name || r.symbol,
          segment,
          sector: canonicalSector(r.sector),
          industry: r.industry || 'Unknown',
        })),
        source: 'fmp:sp500-constituent',
        detail: 'Financial Modeling Prep index constituents, with GICS sector and sub-industry.',
      }
    }
  }

  // Route 2 — derive membership from the benchmark ETF's holdings. Sector and
  // industry are not in that payload, so they are filled from the index list.
  const benchmark = SEGMENTS.find((s) => s.id === segment)?.benchmark as string
  const holdings = await fmp.etfHoldings(benchmark)
  if (holdings && holdings.length >= (MINIMUM[segment] as number)) {
    const classified = await wikipediaConstituents(segment)
    const bySymbol = new Map(classified.map((c) => [c.ticker, c]))
    log(`  ${segment}: using ${benchmark} holdings (${holdings.length})`)
    return {
      members: holdings.map((raw) => {
        const ticker = normaliseTicker(raw)
        const known = bySymbol.get(ticker)
        return {
          ticker,
          name: known?.name ?? ticker,
          segment,
          sector: known?.sector ?? 'Unknown',
          industry: known?.industry ?? 'Unknown',
        }
      }),
      source: `fmp:etf-holdings:${benchmark}`,
      detail: `Derived from ${benchmark} holdings; GICS classification from the index constituents list.`,
    }
  }

  // Route 3 — the index's own published constituents table.
  const rows = await wikipediaConstituents(segment)
  return {
    members: rows,
    source: `wikipedia:sp${segment}`,
    detail:
      'FMP publishes no constituent endpoint for this index and ETF holdings are not included in this subscription, so membership comes from the index constituents table.',
  }
}

/**
 * Parses the constituents table from the index's Wikipedia page.
 *
 * Deliberately narrow: it locates the table by its `constituents` anchor and
 * accepts only rows whose first cell is a plausible ticker. A layout change
 * produces a short list, and the caller rejects a short list rather than
 * publishing a partial index.
 */
export async function wikipediaConstituents(segment: Segment): Promise<Member[]> {
  const response = await fetch(WIKIPEDIA[segment], {
    headers: { 'User-Agent': 'Duo/1.0 (github.com/vandyckmed-droid/Duo)' },
  })
  if (!response.ok) throw new Error(`Wikipedia sp${segment}: HTTP ${response.status}`)
  return parseConstituentsTable(await response.text(), segment)
}

export function parseConstituentsTable(html: string, segment: Segment): Member[] {
  const anchor = html.indexOf('id="constituents"')
  if (anchor === -1) throw new Error(`sp${segment}: constituents table not found`)
  const rest = html.slice(anchor)
  const table = rest.slice(0, rest.indexOf('</table>'))

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...(m[1] as string).matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
      decodeEntities((c[1] as string).replace(/<[^>]*>/g, '')).trim(),
    ),
  )

  const out: Member[] = []
  for (const cells of rows) {
    const [symbol, name, sector, industry] = cells
    if (!symbol || !name || !sector) continue
    if (!/^[A-Z][A-Z.-]{0,6}$/.test(symbol)) continue
    out.push({
      ticker: normaliseTicker(symbol),
      name,
      segment,
      sector: canonicalSector(sector),
      industry: industry || 'Unknown',
    })
  }
  return out
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
}

/**
 * Eligibility, in two passes.
 *
 * Index membership answers most of the question. What is left is deciding
 * between listings that describe the same position, and that decision needs
 * evidence the two passes have at different times.
 *
 * **Before prices are fetched**, a ticker appearing in two segments is
 * resolved: it has one true home, and the larger index is it — a name promoted
 * out of the 600 can linger in a stale list, and keeping both would rank it
 * twice against two different benchmarks.
 *
 * **After prices are fetched**, duplicate share classes are resolved. This has
 * to wait, because the only thing that reliably separates two classes of the
 * same company is which one is actually trading. Choosing on market cap alone
 * once kept `CWEN-A`, whose feed had stopped three months earlier, and dropped
 * the live `CWEN` — a row that could never show a return.
 */

const SEGMENT_RANK: Record<Segment, number> = { '500': 3, '400': 2, '600': 1 }

export interface Exclusion {
  readonly ticker: string
  readonly reason: string
}

/** One ticker appearing in more than one segment keeps the larger index. */
export function resolveSegmentConflicts(members: readonly Member[]): {
  members: Member[]
  excluded: Exclusion[]
} {
  const excluded: Exclusion[] = []
  const bySymbol = new Map<string, Member>()

  for (const m of members) {
    const existing = bySymbol.get(m.ticker)
    if (!existing) {
      bySymbol.set(m.ticker, m)
      continue
    }
    const keep = SEGMENT_RANK[m.segment] >= SEGMENT_RANK[existing.segment] ? m : existing
    const drop = keep === m ? existing : m
    excluded.push({
      ticker: drop.ticker,
      reason: `listed in both the ${drop.segment} and the ${keep.segment}; kept the ${keep.segment}`,
    })
    bySymbol.set(m.ticker, keep)
  }

  return {
    members: [...bySymbol.values()].sort((a, b) => (a.ticker < b.ticker ? -1 : 1)),
    excluded,
  }
}

/**
 * What is known about a listing once its prices have been fetched.
 *
 * `staleness` is how many trading days separate the security's last usable
 * close from the dataset's last trading day. Zero means it traded on the most
 * recent day; a large number means the feed has stopped.
 */
export interface PriceEvidence {
  readonly staleness: number
  readonly observations: number
  readonly marketCap: number | null
}

/**
 * A listing whose last close is further back than this cannot produce any
 * return at all — every window is anchored at the dataset's last trading day
 * and endpoint tolerance reaches back only a few days. A month of silence is a
 * delisting the index list has not caught up with, and publishing it means a
 * permanently blank row.
 */
export const MAX_STALENESS = 21

/**
 * Picks one listing per company and drops what has stopped trading.
 *
 * The order of preference between two share classes: the one still trading,
 * then the one with more history, then the larger listing, then — so the
 * choice is never arbitrary — the alphabetically first ticker.
 */
export function resolveShareClasses(
  members: readonly Member[],
  evidenceOf: (ticker: string) => PriceEvidence,
): { eligible: Member[]; excluded: Exclusion[] } {
  const excluded: Exclusion[] = []

  const live: Member[] = []
  for (const m of members) {
    const evidence = evidenceOf(m.ticker)
    if (evidence.observations === 0) {
      excluded.push({ ticker: m.ticker, reason: 'no usable price history' })
    } else if (evidence.staleness > MAX_STALENESS) {
      excluded.push({
        ticker: m.ticker,
        reason: `no close in the last ${evidence.staleness} trading days; treated as delisted`,
      })
    } else {
      live.push(m)
    }
  }

  const byCompany = new Map<string, Member>()
  for (const m of live) {
    const key = companyKey(m.name)
    const existing = byCompany.get(key)
    if (!existing) {
      byCompany.set(key, m)
      continue
    }
    const keep = preferred(m, existing, evidenceOf)
    const drop = keep === m ? existing : m
    excluded.push({
      ticker: drop.ticker,
      reason: `duplicate share class of ${keep.ticker} (${keep.name})`,
    })
    byCompany.set(key, keep)
  }

  return {
    eligible: [...byCompany.values()].sort((a, b) => (a.ticker < b.ticker ? -1 : 1)),
    excluded,
  }
}

function preferred(
  a: Member,
  b: Member,
  evidenceOf: (ticker: string) => PriceEvidence,
): Member {
  const ea = evidenceOf(a.ticker)
  const eb = evidenceOf(b.ticker)
  if (ea.staleness !== eb.staleness) return ea.staleness < eb.staleness ? a : b
  if (ea.observations !== eb.observations) return ea.observations > eb.observations ? a : b
  const ca = ea.marketCap ?? 0
  const cb = eb.marketCap ?? 0
  if (ca !== cb) return ca > cb ? a : b
  return a.ticker < b.ticker ? a : b
}

/**
 * A company identity that survives share-class suffixes and the punctuation
 * the index lists are inconsistent about.
 */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'()]/g, '')
    .replace(/\b(class|series)\s+[a-c]\b/g, '')
    .replace(/\b(inc|corp|corporation|company|co|ltd|plc|holdings|holding|group|the|sa|nv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
