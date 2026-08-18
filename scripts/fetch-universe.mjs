/**
 * Rebuilds the committed dataset: the S&P MidCap 400 universe and three
 * years of dividend-adjusted daily closes for each constituent.
 *
 *   FMP_API_KEY=... node scripts/fetch-universe.mjs
 *
 * Writes:
 *   src/data/universe.generated.ts  — ticker, name, sector (small, bundled)
 *   public/data/prices.json         — shared date index + per-ticker closes
 *
 * Prices live in public/ rather than src/ so they ship as a separately
 * cacheable asset instead of inflating the JS bundle, which matters on a
 * phone. Run this to refresh the data; nothing fetches at page load.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API_KEY = process.env.FMP_API_KEY ?? process.env.API_KEY
const YEARS = 3
const CONCURRENCY = 6

if (!API_KEY) {
  console.error('Set FMP_API_KEY (or API_KEY) in the environment.')
  process.exit(1)
}

const WIKI_URL = 'https://en.wikipedia.org/wiki/List_of_S%26P_400_companies'
const FMP = 'https://financialmodelingprep.com/stable'

/** Scrapes the constituents table from the Wikipedia list page. */
async function fetchConstituents() {
  const res = await fetch(WIKI_URL, {
    headers: { 'User-Agent': 'Duo/1.0 (github.com/vandyckmed-droid/Duo)' },
  })
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
  const html = await res.text()

  const anchor = html.indexOf('id="constituents"')
  if (anchor === -1) throw new Error('constituents table not found')
  const table = html.slice(anchor, anchor + html.slice(anchor).indexOf('</table>'))

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
      decodeEntities(c[1].replace(/<[^>]*>/g, '').trim()),
    ),
  )

  const constituents = rows
    .filter((r) => r.length >= 3 && /^[A-Z][A-Z.\-]*$/.test(r[0]))
    .map(([ticker, name, sector]) => ({ ticker, name, sector }))

  if (constituents.length < 300) {
    throw new Error(`only parsed ${constituents.length} constituents`)
  }
  return constituents
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

/** Three years of dividend-adjusted daily closes, oldest first. */
async function fetchPrices(ticker, from, to) {
  const url =
    `${FMP}/historical-price-eod/dividend-adjusted` +
    `?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&apikey=${API_KEY}`

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 429) {
        await sleep(2000 * attempt)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (!Array.isArray(body)) throw new Error('unexpected payload')
      // FMP returns newest-first; store oldest-first.
      return body
        .filter((p) => p?.date && Number.isFinite(p.adjClose) && p.adjClose > 0)
        .map((p) => ({ date: p.date.slice(0, 10), close: round2(p.adjClose) }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    } catch (error) {
      if (attempt === 4) {
        console.warn(`  ${ticker}: giving up — ${error.message}`)
        return []
      }
      await sleep(1000 * attempt)
    }
  }
  return []
}

const round2 = (n) => Math.round(n * 100) / 100
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Runs `worker` over `items` with a bounded number in flight. */
async function pooled(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await worker(items[i], i)
      }
    }),
  )
  return results
}

async function main() {
  const to = new Date().toISOString().slice(0, 10)
  const fromDate = new Date()
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - YEARS)
  const from = fromDate.toISOString().slice(0, 10)

  console.log(`Fetching S&P 400 constituents…`)
  const constituents = await fetchConstituents()
  console.log(`  ${constituents.length} constituents`)

  console.log(`Fetching ${YEARS}y adjusted closes (${from} → ${to})…`)
  let done = 0
  const histories = await pooled(constituents, CONCURRENCY, async (c) => {
    const points = await fetchPrices(c.ticker, from, to)
    if (++done % 50 === 0) console.log(`  ${done}/${constituents.length}`)
    return { ticker: c.ticker, points }
  })

  // Keep only constituents that actually returned a usable series.
  const usable = histories.filter((h) => h.points.length > 200)
  const dropped = histories.filter((h) => h.points.length <= 200)
  if (dropped.length) {
    console.log(`  dropped ${dropped.length}: ${dropped.map((d) => d.ticker).join(', ')}`)
  }

  // Shared, ascending trading-day index across every series.
  const dates = [...new Set(usable.flatMap((h) => h.points.map((p) => p.date)))].sort()
  const index = new Map(dates.map((d, i) => [d, i]))

  const series = {}
  for (const { ticker, points } of usable) {
    const row = new Array(dates.length).fill(null)
    for (const p of points) row[index.get(p.date)] = p.close
    series[ticker] = row
  }

  const kept = new Set(usable.map((h) => h.ticker))
  const universe = constituents.filter((c) => kept.has(c.ticker))

  await mkdir(resolve(ROOT, 'public/data'), { recursive: true })
  await writeFile(
    resolve(ROOT, 'public/data/prices.json'),
    JSON.stringify({ generatedAt: to, from, to, dates, series }),
  )

  await writeFile(
    resolve(ROOT, 'src/data/universe.generated.ts'),
    renderUniverse(universe, to),
  )

  console.log(
    `\nWrote ${universe.length} tickers × ${dates.length} trading days.`,
  )
}

function renderUniverse(universe, generatedAt) {
  const rows = universe
    .map(
      (c) =>
        `  { ticker: ${JSON.stringify(c.ticker)}, name: ${JSON.stringify(c.name)}, sector: ${JSON.stringify(c.sector)} },`,
    )
    .join('\n')

  return `import type { Stock } from './types.ts'

/**
 * S&P MidCap 400 constituents.
 *
 * GENERATED by scripts/fetch-universe.mjs on ${generatedAt} — do not edit by
 * hand. Sourced from the Wikipedia list of S&P 400 companies, filtered to
 * those with a usable price history from Financial Modeling Prep.
 *
 * Logos are resolved from the ticker at render time, so no logo URL is
 * stored here.
 */
export const UNIVERSE: readonly Stock[] = [
${rows}
]
`
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
