/**
 * Regenerates `src/data/priceSeries.generated.ts` from a real price feed.
 *
 * Run with `npm run fetch:prices`. Nothing at runtime talks to the network —
 * the site is a static build, so the fetch happens here, at authoring time,
 * and the result is committed. Keeping the fetch in a script rather than in
 * the app means the dataset is reproducible and reviewable as a diff.
 *
 * The universe is read from `src/data/stocks.ts`, so this script never holds
 * a second copy of the ticker list that could drift from the real one.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { STOCKS } from '../src/data/stocks.ts'
import { BENCHMARK } from '../src/data/benchmark.ts'

/** How much history to request. Three years of daily bars is ~750 points. */
const RANGE = '3y'

/** Decimal places kept per close. Far more precision than any return needs. */
const PRICE_PRECISION = 4

/** Politeness delay between symbols; the feed rate-limits bursts. */
const REQUEST_SPACING_MS = 400

const MAX_ATTEMPTS = 8
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const OUTPUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'priceSeries.generated.ts',
)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Yahoo writes class shares with a hyphen (BRK-B) where the exchange and our
 * dataset use a dot (BRK.B). The mapping lives here so the dataset can keep
 * the conventional ticker.
 */
function toFeedSymbol(ticker) {
  return ticker.replaceAll('.', '-')
}

/**
 * Fetches one symbol's daily bars, retrying with exponential backoff and
 * alternating between the feed's two hosts — a burst of ~50 symbols reliably
 * trips a rate limit on either one alone.
 */
async function fetchChart(ticker) {
  const symbol = toFeedSymbol(ticker)

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const host = attempt % 2 === 0 ? 'query2' : 'query1'
    const url =
      `https://${host}.finance.yahoo.com/v8/finance/chart/${symbol}` +
      `?range=${RANGE}&interval=1d&events=div%2Csplit`

    let body
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      })
      body = await response.text()
      if (response.ok && body.startsWith('{')) {
        return JSON.parse(body)
      }
    } catch (error) {
      body = String(error)
    }

    console.warn(`  ${ticker}: attempt ${attempt + 1} failed (${body.slice(0, 60)})`)
    await sleep(1000 * 2 ** attempt)
  }

  throw new Error(`Could not fetch ${ticker} after ${MAX_ATTEMPTS} attempts`)
}

/**
 * Reduces a chart response to `date -> adjusted close`.
 *
 * Bar timestamps are the session open in UTC, so they are shifted by the
 * exchange's own UTC offset before the calendar date is read — otherwise a
 * market that opens after 00:00 UTC would be dated a day late.
 *
 * Two kinds of bar are dropped rather than carried forward, so the dataset
 * never contains an invented or unsettled price:
 *
 * - Bars with a missing or non-positive close (holidays the feed still
 *   emits, listings that had no print that session).
 * - The current session. While the market is open the feed reports the live
 *   price in the last bar, which is not an end-of-day close; including it
 *   would make the dataset depend on the minute it was generated. Anything
 *   dated on or after today *in the exchange's own timezone* is cut.
 */
function toDatedCloses(chart, ticker) {
  const result = chart?.chart?.result?.[0]
  const timestamps = result?.timestamp
  const closes = result?.indicators?.adjclose?.[0]?.adjclose

  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    throw new Error(`${ticker}: response carried no adjusted-close series`)
  }

  const offsetSeconds = result.meta?.gmtoffset ?? 0
  const exchangeDate = (epochSeconds) =>
    new Date((epochSeconds + offsetSeconds) * 1000).toISOString().slice(0, 10)
  const today = exchangeDate(Date.now() / 1000)
  const byDate = new Map()

  for (const [index, timestamp] of timestamps.entries()) {
    const close = closes[index]
    if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) {
      continue
    }

    const date = exchangeDate(timestamp)
    if (date >= today) {
      continue
    }

    byDate.set(date, Number(close.toFixed(PRICE_PRECISION)))
  }

  if (byDate.size === 0) {
    throw new Error(`${ticker}: response carried no usable closes`)
  }

  return byDate
}

/** Serialises a value as a TypeScript literal, `null` included. */
function toCell(value) {
  return value === undefined ? 'null' : String(value)
}

/** Wraps a long list of numbers so the generated file stays readable. */
function formatRow(values, indent) {
  const lines = []
  for (let index = 0; index < values.length; index += 10) {
    lines.push(indent + values.slice(index, index + 10).map(toCell).join(', ') + ',')
  }
  return lines.join('\n')
}

async function main() {
  const symbols = [BENCHMARK, ...STOCKS]
  /** @type {Map<string, Map<string, number>>} */
  const seriesByTicker = new Map()

  for (const [index, stock] of symbols.entries()) {
    console.log(`[${index + 1}/${symbols.length}] ${stock.ticker}`)
    const chart = await fetchChart(stock.ticker)
    seriesByTicker.set(stock.ticker, toDatedCloses(chart, stock.ticker))
    await sleep(REQUEST_SPACING_MS)
  }

  // The shared grid is the union of every series' dates, not the benchmark's
  // alone, so a date only one listing traded on is still represented rather
  // than silently dropped. Per-series gaps become `null` cells.
  const dates = [
    ...new Set([...seriesByTicker.values()].flatMap((series) => [...series.keys()])),
  ].sort()

  const row = (ticker) => {
    const series = seriesByTicker.get(ticker)
    return dates.map((date) => series.get(date))
  }

  const coverage = (ticker) =>
    `${seriesByTicker.get(ticker).size}/${dates.length}`

  const stockRows = STOCKS.map(
    (stock) =>
      `  // ${stock.ticker} — ${coverage(stock.ticker)} sessions\n` +
      `  '${stock.ticker}': [\n${formatRow(row(stock.ticker), '    ')}\n  ],`,
  ).join('\n')

  const file = `// GENERATED FILE — do not edit by hand.
// Regenerate with \`npm run fetch:prices\` (see scripts/fetch-prices.mjs).
import type { StockTicker } from './stocks.ts'

/**
 * Real daily adjusted closes for the universe and the benchmark, stored
 * column-wise against a shared trading-date grid.
 *
 * The grid exists for size, not for semantics: ~50 series of ~750 sessions
 * written as explicit date/price pairs would be several times larger to ship
 * to a phone. \`src/data/prices.ts\` expands these columns back into the
 * per-ticker \`StockPriceHistory\` shape the rest of the codebase is written
 * against, so nothing downstream knows or cares that the grid exists.
 *
 * A \`null\` cell means that series had no usable close that session. It is
 * left as a gap rather than filled, because an invented price would flow
 * straight into returns and betas.
 */
export const PRICE_SERIES_META = {
  /** Where the closes came from. */
  source: 'Yahoo Finance daily chart API (split- and dividend-adjusted closes)',
  /** The date this file was regenerated. */
  generatedOn: '${new Date().toISOString().slice(0, 10)}',
  /** Ticker of the series in \`BENCHMARK_CLOSES\`. */
  benchmarkTicker: '${BENCHMARK.ticker}',
} as const

/** Every trading date covered, oldest first. */
export const TRADING_DATES: readonly string[] = [
${formatRow(dates.map((date) => `'${date}'`), '  ')}
]

/** The benchmark's closes, aligned to \`TRADING_DATES\`. */
export const BENCHMARK_CLOSES: readonly (number | null)[] = [
${formatRow(row(BENCHMARK.ticker), '  ')}
]

/**
 * Each stock's closes, aligned to \`TRADING_DATES\`.
 *
 * \`satisfies\` makes this total over \`StockTicker\`: adding a stock to
 * \`STOCKS\` without regenerating this file is a compile error, not a blank
 * card discovered at runtime.
 */
export const STOCK_CLOSES = {
${stockRows}
} satisfies Record<StockTicker, readonly (number | null)[]>
`

  writeFileSync(OUTPUT_PATH, file)
  console.log(
    `\nWrote ${OUTPUT_PATH}\n  ${STOCKS.length} stocks + ${BENCHMARK.ticker}` +
      `\n  ${dates.length} sessions, ${dates[0]} → ${dates.at(-1)}`,
  )
}

await main()
