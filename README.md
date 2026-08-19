# Duo

S&P MidCap 400 constituents ranked by 12–1 momentum, volatility, or
residual return, filterable to a single GICS sector. Phone-first, black
background, white text.

Live: https://vandyckmed-droid.github.io/Duo/

The active metric and sector live in the URL hash, so a ranking can be
linked and reloaded as seen (`#metric=volatility&sector=Energy`).

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
  per constituent, from Financial Modeling Prep, plus the benchmark series.

Nothing is fetched at page load; the app reads the committed dataset.

The benchmark is **IJH**, an ETF tracking the same index. Using a real ETF
rather than rebuilding the index from today's constituents avoids survivorship
bias: a reconstructed benchmark would silently omit the names that left the
index over the period, which skew toward the worst performers. It is stored
outside `series` so it can never be ranked as a constituent.

Three years is more history than the return windows need — it is the span the
beta estimate uses. Beta fitted over a single year comes back unstable enough
to go negative; over three years it does not.

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
