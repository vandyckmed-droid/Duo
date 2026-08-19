# Duo

An iPhone-first stock ranking and decision interface over the **S&P 1500**.
It answers one question: *what deserves my attention right now, and why?*

Live: <https://vandyckmed-droid.github.io/Duo/>

The app opens directly into the ranked list. There is no landing page and no
dashboard — the first thing on screen is the ranking, already sorted.

**V2** adds two evidence-backed pieces on top of the frozen V1 (`v1.0`,
`v1-stable`): a one-line market momentum regime statement on the ranked
list, and an EPS-surprise metric with a latest-earnings section on the
ticker detail. Why each is defensible — with the internal walk-forward
evidence and the published literature — is in `docs/V2-CHANGES.md`; the
full experiment ledger is `docs/RESEARCH-REGISTRY.md`.

```
screener → ranker → investigation → watchlist → portfolio
```

## The shape of it

- **The ranking variable is switchable from the list.** 12−1, 6−1, 12M, 3M,
  return/vol, residual return, volatility, beta, 63-day rank change, market
  cap. Switching reranks instantly and preserves every filter.
- **Three segments, three benchmarks.** S&P 500 → SPY, MidCap 400 → IJH,
  SmallCap 600 → IJR. Segment is authoritative metadata on every security and
  decides which ETF its beta and residual return are measured against. A 600
  name's residual is against IJR, never SPY.
- **Nothing is fetched while browsing.** Changing metric, segment, sector,
  direction or watchlist state is arithmetic over an array already in memory.
- **Every metric states its own definition**, on the screen that applies it.
  No composites, no blended scores, no weightings.

## Architecture

The layers are kept separate so that swapping the data provider touches one
directory and nothing else.

```
provider ingestion → canonical metadata → adjusted-price cache
    → calculation engine → ranking engine → published dataset → interface
```

| Path | What lives there |
| --- | --- |
| `src/engine/` | Pure mathematics over aligned price series. No React, no fetch, no knowledge of FMP or of the S&P 1500. |
| `src/domain/` | Segments and their benchmarks, measurement windows, the metric registry, the GICS taxonomy, the published-dataset contract, the ranking engine. |
| `src/data/` | Reads the published JSON. The only network code in the bundle, and it only talks to its own origin. |
| `src/state/` | State that survives a reload, validated on the way in. |
| `src/ui/` | Presentation. |
| `pipeline/` | Runs in GitHub Actions. The only place the API key is read. |

## The API key

The key is a repository secret, read from the environment by `pipeline/fmp.ts`,
inside GitHub Actions, and nowhere else. Either `FMP_API_KEY` or `API_KEY` is
accepted — the first names the provider, the second is the name the credential
is already configured under, and renaming a working secret is a worse trade
than reading two names.

- The browser never calls Financial Modeling Prep and never sees the key.
- The client bundle has no provider client in it at all. CI greps the built
  bundle for the key name, the provider host and an `apikey` parameter; the
  refresh workflow additionally greps the whole built site for the **key's own
  value**, which it can do because the secret is in that job's environment.
  Either finding anything fails the run.
- The key is never written to a file, never interpolated into a log line, and
  never reaches the published dataset.

## Refreshing the data

`.github/workflows/publish.yml` runs on a schedule and on manual dispatch:

1. **Membership.** Resolves each segment's constituents and records where they
   came from in the published manifest.
2. **Prices.** Restores the adjusted-price cache and asks the provider only for
   the days after each ticker's last cached close, plus a short overlap so
   retroactive adjustments are picked up.
3. **Compute.** Runs the calculation engine over the cache.
4. **Validate.** Structural gates — one of which asserts that every security
   carries its own segment's benchmark.
5. **Publish.** Writes to a staging directory and moves it into place in one
   rename.

Two invariants shape all of it:

- **A failed provider request never destroys good history.** A ticker whose
  fetch fails keeps every close it already had and is marked stale.
- **A dataset that fails validation is not published.** The dataset already on
  Pages is the last one that passed, and it keeps serving.

Locally:

```
FMP_API_KEY=… npm run refresh          # full S&P 1500, ~2 minutes cold
DUO_MAX_PER_SEGMENT=40 npm run refresh # a quick subset while developing
```

### Where segment membership comes from

Verified against the live API on 19 August 2026:

| Segment | Route | Why |
| --- | --- | --- |
| 500 | `fmp:sp500-constituent` | Available, and carries GICS sector and sub-industry. |
| 400 | index constituents table | FMP publishes no `sp400-constituent` endpoint (404), and `etf/holdings` for IJH is HTTP 402 on this subscription. |
| 600 | index constituents table | Same: no `sp600-constituent` endpoint, and `etf/holdings` for IJR is 402. |

The pipeline still tries the provider-native routes first on every run, in the
order constituent endpoint → ETF holdings → index table. If the subscription
gains ETF holdings, it switches by itself and the manifest starts saying so.
The route actually used is recorded per segment in `manifest.json` and shown
in Settings.

## Published dataset

Written to `public/data/` by the pipeline, served as static JSON, never
committed.

| File | Contents |
| --- | --- |
| `manifest.json` | As-of date, counts, membership provenance, window definitions, exclusions. |
| `universe.json` | Every security with every metric, and the same metrics evaluated 63 trading days earlier. One request, ~350 kB gzipped — the ranked list renders from this alone. |
| `series/<TICKER>.json` | Adjusted closes, fetched only when a chart or a portfolio calculation needs one. |

## The calculation engine

Windows are counted in **trading days**, never calendar months, so a window is
a fixed amount of market activity rather than a date range a holiday can
shorten.

| Quantity | Definition |
| --- | --- |
| 12−1 momentum | Return over 252 trading days ending 21 trading days ago. |
| 6−1 momentum | Return over 126 trading days ending 21 trading days ago. |
| Raw returns | 1M / 3M / 6M / 12M, no skip. |
| Volatility | Sample standard deviation of daily simple returns × √252, over 63 or 252 days. |
| Return / vol | 12-month return ÷ 1-year volatility. No risk-free rate. |
| Max drawdown | Deepest peak-to-trough fall over the trailing year. |
| Beta | OLS slope of daily returns on the **segment benchmark**, 756 days, fitted with an intercept, using only days both traded. |
| Residual return | `r_stock − β × r_benchmark` over the same window. The intercept is **not** subtracted. |
| Rank change | Positions climbed in the 12−1 ranking of the list on screen over 63 trading days. |

Absent data stays absent. Nothing is interpolated, no gap is bridged, and a
security with no value for a metric is set aside from the ranking and named,
rather than ranked last — a missing 12−1 is not the worst momentum in the
market.

## Development

```
npm install
npm run dev

npm run verify     # lint, typecheck, test, build — what CI runs
```

Individually: `npm run lint`, `npm run typecheck`, `npm run test` (197 tests, no
network), `npm run build`.

The test suite covers boundaries rather than happy paths: endpoint selection
and tolerance, formation and skip windows, exactly-minimum history, gaps at
window endpoints, zero and negative prints, insufficient overlap for a
regression, degenerate benchmarks, the segment → benchmark mapping, ranking
ties and unmeasured names, rank-change direction, membership churn, duplicate
share classes, cache merges that must never lose history, and every validation
gate.

### Adding a metric

Append an entry to `METRICS` in `src/domain/metrics.ts` with an id, labels, a
definition, a direction, and functions returning its current and 63-day-prior
values. The metric strip, the rows, the ranking, the detail page and Settings
all read from the registry, so nothing else changes.

### Adding a horizon

Append an entry to `WINDOWS` in `src/domain/windows.ts`. A horizon is a pair of
trading-day counts; no code branches on which window it is holding.
