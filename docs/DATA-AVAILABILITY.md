# V2 Data Availability

Probed against the live FMP subscription from Actions on 2026-08-19
(workflow "Probe V2 data", run 32232355294). 15 of 16 candidate endpoints
answer. This inventory — not the wish list — defines what V2 signals may be
built from.

## Available

| Endpoint | Feeds | Point-in-time field | Notes |
| --- | --- | --- | --- |
| `earnings` | Fundamental momentum | `date` (announcement) | epsActual/epsEstimated, revenueActual/revenueEstimated — earnings surprise without the 404ing `earnings-surprises` endpoint |
| `earnings-calendar` | Earnings drift | `date` | ranged query; 4,000 rows/month across the market |
| `analyst-estimates` | Fundamental momentum | **none** — see limitations | consensus low/avg/high for revenue, ebitda, ebit, net income, eps + analyst counts |
| `grades`, `grades-consensus` | Fundamental momentum | `date` per grade action | 1,786 rows for one ticker; consensus is a snapshot |
| `price-target-summary` | Fundamental momentum | rolling windows | snapshot of 1M/3M/1Y average targets |
| `income-statement` | Quality | `filingDate`, `acceptedDate` | quarterly; eps, revenue, margins components |
| `balance-sheet-statement` | Quality | `filingDate`, `acceptedDate` | quarterly; debt, equity, assets |
| `cash-flow-statement` | Quality | `filingDate`, `acceptedDate` | quarterly; buybacks (`commonStockRepurchased`), issuance |
| `key-metrics` | Quality | statement-derived | ROA/ROE/ROIC, gross-profit-to-assets ingredients |
| `ratios` | Quality | statement-derived | margins, leverage, coverage |
| `financial-growth` | Fundamental momentum | statement-derived | revenue/eps growth and acceleration ingredients |
| `shares-float` | Context / dilution | snapshot | outstanding + float |
| `enterprise-values` | Context | quarterly | market cap history |
| `historical-price-eod/dividend-adjusted` | **Alpha Lab** | `date` | reaches back at least to 2016 → ~10y of walk-forward and regime coverage, far beyond the ~3.4y production cache |

## Not available

- `earnings-surprises` — 404. Not needed: `earnings` carries the same
  actual-vs-estimated pairs.
- S&P 400/600 constituent endpoints and IJH/IJR `etf/holdings` — 404/402
  (established during V1). Membership still resolves from index tables.

## Immediate consequences for V2

1. Fundamental momentum and earnings drift are **feasible** with clean
   announcement dating from `earnings`.
2. Quality is **feasible** with true point-in-time discipline via
   `filingDate`/`acceptedDate` on the statements.
3. The Alpha Lab can walk forward over roughly a decade of prices — enough to
   cover the 2020 crash, the 2022 bear, and several rotations — instead of
   the production cache's ~3.4 years.
4. Estimate *revisions* have no historical as-of timestamps (see
   DATA-LIMITATIONS.md): revision signals must be accumulated forward from
   live snapshots, not backfilled.
