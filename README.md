# Duo

The S&P Composite 1500 ranked by volatility-adjusted momentum, as a phone-first
web app. The ranked list is the product: rank, ticker, company, score, sector,
and where the latest price sits in its 52-week range.

**Ranking.** For each stock, two signals: 12−1 momentum (252 trading days of
formation, skipping the latest 21) and 6−1 momentum (126 days, same skip).
Each signal is the window's return divided by annualised daily volatility over
the same span. The two are z-normalised across the universe and blended 50/50
into the final score. That blend is V1's one and only ranking.

**Selection.** Tap a row to add it to the basket (equal weights by default,
editable while always summing to 100%). Star a row to watch it. Both persist
locally on the device, independently of each other.

## Architecture

Four layers, each ignorant of the ones above it:

| Layer | Where | Knows about |
| --- | --- | --- |
| FMP data | `pipeline/` | the provider, the API key, the price cache |
| Financial calculations | `src/calc/` | pure math on aligned price series |
| Ranking & portfolio state | `src/state/` + `src/calc/ranking.ts` | signals, weights, filters |
| UI | `src/ui/` | `RankedSecurity[]` and the user's own state |

`src/domain/` holds the shared vocabulary: segments, sectors, and the dataset
contract (`data/universe.json` + `data/manifest.json`).

The pipeline publishes raw per-stock signal values; normalisation, blending
and ranking run in the app from a `RankSpec`. A new momentum window, residual
signal, or weighting scheme is a new signal key and a new spec — no dataset
format change, no UI rewrite.

## Deployment

GitHub Pages serves the `docs/` directory of `main`. The
`Refresh and publish` workflow (weekday schedule + on demand) runs the FMP
pipeline, builds the site into `docs/` with the fresh dataset inside, and
commits the result to `main`. If validation fails, nothing is committed and
the previous dataset keeps serving. CI never needs the API key.

## Commands

```sh
npm run dev        # local dev server
npm run refresh    # FMP_API_KEY=… refresh public/data (DUO_MAX_PER_SEGMENT=25 for a quick run)
npm run build      # build into docs/
npm run verify     # lint + typecheck + tests + build
```
