# Duo

S&P MidCap 400 constituents ranked by 12–1 momentum or volatility.
Phone-first, black background, white text.

Live: https://vandyckmed-droid.github.io/Duo/

## Development

```
npm install
npm run dev
```

```
npm run test    # vitest
npm run lint    # oxlint
npm run build   # tsc + vite, outputs to docs/
```

`docs/` is the published GitHub Pages directory and is committed. CI fails if
it is stale, so run `npm run build` before pushing UI or data changes.

## Refreshing the data

```
FMP_API_KEY=... node scripts/fetch-universe.mjs
```

Rebuilds both generated artifacts:

- `src/data/universe.generated.ts` — ticker, name and sector for each
  constituent, scraped from the Wikipedia list of S&P 400 companies.
- `public/data/prices.json` — three years of dividend-adjusted daily closes
  per constituent, from Financial Modeling Prep.

Nothing is fetched at page load; the app reads the committed dataset. Three
years is more history than the current metrics need — it is the span required
to estimate beta against an equal-weight index, for the market-residualized
return the metric registry is built to accept.

## Layout

| Path | Purpose |
| --- | --- |
| `src/data/` | The dataset and its loader. Prices are columnar: one shared calendar, one array of closes per ticker. |
| `src/calculations/` | Pure, framework-free maths. No React, no dataset knowledge. |
| `src/metrics/` | The metric registry and the ranking. |
| `src/ui/` | Presentation. |
| `scripts/` | The data refresh, run by hand rather than at build time. |

### Adding a metric

Metrics are data, not branches. Append an entry to `METRICS` in
`src/metrics/index.ts` giving it an id, labels, a `compute` function, a
formatter and a sort direction. The column, the sort control, the card cell
and the grid all read from the registry, so nothing else needs editing.

Ticker and logo are deliberately fixed — they identify a row and never change
with the sort.
