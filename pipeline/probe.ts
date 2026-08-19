/**
 * Data-availability probe for V2.
 *
 * V2's fundamental-momentum and quality families depend on datasets this FMP
 * subscription may or may not serve. Rather than designing signals around
 * data we cannot get (or discovering a 402 three layers deep in a pipeline),
 * this script asks the API directly which endpoints answer, and with what
 * fields.
 *
 * It prints, per endpoint: HTTP status, row count, and the field names of the
 * first row — never values, never the key. Safe for public Actions logs.
 *
 * Run in Actions (where the secret lives):  npx tsx pipeline/probe.ts
 */
import { readApiKey } from './fmp.ts'

const BASE = 'https://financialmodelingprep.com/stable'

/** Endpoints V2 signals would draw on, each tagged with the family it feeds. */
const PROBES: ReadonlyArray<{ family: string; path: string; params: Record<string, string> }> = [
  // Fundamental momentum: surprises and expectation revisions
  { family: 'fundamental', path: 'earnings', params: { symbol: 'AAPL', limit: '8' } },
  { family: 'fundamental', path: 'earnings-surprises', params: { symbol: 'AAPL' } },
  { family: 'fundamental', path: 'analyst-estimates', params: { symbol: 'AAPL', period: 'quarter', limit: '8' } },
  { family: 'fundamental', path: 'grades', params: { symbol: 'AAPL' } },
  { family: 'fundamental', path: 'grades-consensus', params: { symbol: 'AAPL' } },
  { family: 'fundamental', path: 'price-target-summary', params: { symbol: 'AAPL' } },
  // Quality: statements and derived metrics
  { family: 'quality', path: 'income-statement', params: { symbol: 'AAPL', period: 'quarter', limit: '8' } },
  { family: 'quality', path: 'balance-sheet-statement', params: { symbol: 'AAPL', period: 'quarter', limit: '4' } },
  { family: 'quality', path: 'cash-flow-statement', params: { symbol: 'AAPL', period: 'quarter', limit: '4' } },
  { family: 'quality', path: 'key-metrics', params: { symbol: 'AAPL', period: 'quarter', limit: '8' } },
  { family: 'quality', path: 'ratios', params: { symbol: 'AAPL', period: 'quarter', limit: '8' } },
  { family: 'quality', path: 'financial-growth', params: { symbol: 'AAPL', period: 'quarter', limit: '8' } },
  // Point-in-time discipline: filing/announcement dates
  { family: 'point-in-time', path: 'earnings-calendar', params: { from: '2026-07-01', to: '2026-08-01' } },
  // Context
  { family: 'context', path: 'shares-float', params: { symbol: 'AAPL' } },
  { family: 'context', path: 'enterprise-values', params: { symbol: 'AAPL', limit: '4' } },
  // Longer price history for the Alpha Lab (V1 caches ~3.4y; how far back can we reach?)
  { family: 'lab-history', path: 'historical-price-eod/dividend-adjusted', params: { symbol: 'AAPL', from: '2016-01-01', to: '2016-03-01' } },
]

function describe(body: unknown): string {
  const rows = Array.isArray(body) ? body : typeof body === 'object' && body !== null ? [body] : []
  if (rows.length === 0) return 'empty'
  const first = rows[0]
  const fields = typeof first === 'object' && first !== null ? Object.keys(first).join(', ') : typeof first
  return `${Array.isArray(body) ? body.length : 1} row(s); fields: ${fields}`
}

async function main(): Promise<void> {
  const key = readApiKey(process.env)
  let ok = 0
  for (const probe of PROBES) {
    const url = new URL(`${BASE}/${probe.path}`)
    for (const [k, v] of Object.entries(probe.params)) url.searchParams.set(k, v)
    url.searchParams.set('apikey', key)
    const label = `${probe.family.padEnd(14)} ${probe.path}`
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.log(`${label}: HTTP ${res.status}`)
        continue
      }
      const body: unknown = await res.json()
      console.log(`${label}: HTTP 200 — ${describe(body)}`)
      ok += 1
    } catch {
      console.log(`${label}: request failed`)
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  console.log(`\n${ok}/${PROBES.length} endpoints available`)
}

await main()
