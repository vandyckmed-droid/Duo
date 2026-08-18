# Duo

Stocks ranked by one variable, on a phone. React + TypeScript + Vite, black
and white, no controls.

A card is **Logo · Ticker · Variable**. The variable is interchangeable — it
happens to be trailing 12-month return today.

## Development

```
npm install
npm run dev
```

## Build

```
npm run build
```

Builds to `docs/`, published via GitHub Pages from `main` → `/docs`. CI fails
if `docs/` is stale, so commit the rebuilt output alongside source changes.

## Shape of the codebase

| Layer | What it owns |
| --- | --- |
| `src/data` | The universe, the benchmark, and committed price history. |
| `src/calculations` | Pure market maths. Knows nothing about cards. |
| `src/metrics` | Named, formatted, rankable variables built from calculations. |
| `src/ui` | The cards. Knows nothing about which variable it renders. |

### Changing the variable

Write one object satisfying `Metric` — `compute`, `format`, and which way it
sorts — and point `ACTIVE_METRIC` in `src/metrics/index.ts` at it. Nothing in
the ranking, the components or the data layer changes. `betaMetric` exists
alongside `twelveMonthReturnMetric` as a worked second example.

Metrics read a `MetricContext`, which carries both the universe's price
history and the benchmark's, so market-relative variables (residual return,
residual momentum) need no new plumbing: `estimateMarketModel` already
returns `alpha` and `beta`, and `calculateAlignedReturns` already returns the
paired periods those residuals are taken over.

## Price data

`src/data/priceSeries.generated.ts` holds ~3 years of daily split- and
dividend-adjusted closes for the universe and for SPY, stored column-wise
against a shared trading-date grid. It is generated, not written:

```
npm run fetch:prices
```

The fetch happens at authoring time and the result is committed, so the
published site is fully static and makes no network calls of its own. The
script drops the in-progress session, so the dataset only ever contains
settled end-of-day closes.

`src/data/prices.ts` expands those columns back into the per-ticker
`StockPriceHistory` shape the rest of the codebase is written against — the
grid is a storage detail, not part of the data contract.

**On data quality:** the closes and volatilities the feed returns are
plausible, and the betas derived from them order sensibly (high for
semiconductors, low for staples). But the daily correlation between the
defensive names and SPY comes back near zero, which real markets do not do —
so treat the low-beta end of the range as a property of this snapshot rather
than a market fact. `src/metrics/ranking.regression.test.ts` cross-checks the
pipeline itself against an independent computation over the same columns, and
regenerating from a different feed requires no code change.
