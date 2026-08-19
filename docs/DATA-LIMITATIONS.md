# Known Data Limitations

The directive requires unavoidable limitations to be detected and documented
rather than papered over. These are the ones that shape what V2 research can
honestly claim.

## 1. Survivorship bias in the research universe

There is no historical index-membership endpoint on this subscription, and no
delisted-security feed. The Alpha Lab's universe is therefore **today's
S&P 1500 members projected backwards**. Names that fell out (bankruptcies,
acquisitions, demotions) are absent from history, which inflates absolute
backtest returns — the losers that left are exactly the names a momentum
portfolio would have been holding on the way down.

Mitigations, not cures:

- Every comparison is **relative on the same biased universe** — V2 signal vs
  V1 signal over identical names and dates — so the bias mostly cancels when
  choosing *between* signals; absolute CAGRs are still not investable claims.
- Membership snapshots are recorded from the live pipeline from now on, so the
  forward record accumulates true point-in-time membership from 2026-08 onward.
- Reported metrics emphasise cross-sectional rank predictiveness (IC, decile
  spreads), which is less distorted by universe attrition than long-only
  portfolio paths.

## 2. Analyst estimates have no historical as-of timestamps

`analyst-estimates` reports consensus per fiscal period but not *when* the
consensus stood at that value. Estimate-revision signals therefore cannot be
backfilled honestly — a backtest built from today's consensus would be
look-ahead by construction.

Consequence: revision signals are **forward-only**. The pipeline snapshots
consensus on every run; a revision signal becomes testable only after enough
live snapshots accumulate. Earnings *surprise* is unaffected — `earnings`
carries the announcement date and the estimate as it stood at announcement.

## 3. Statement dates are trustworthy; derived tables are not dated for PIT

`income-statement`, `balance-sheet-statement` and `cash-flow-statement` carry
`filingDate` and `acceptedDate`, so quality signals built from raw statements
can be point-in-time. The convenience tables (`key-metrics`, `ratios`,
`financial-growth`) carry only fiscal-period dates; where they are used, the
availability date must be taken from the underlying statement's filing date,
and any figure that cannot be tied to one is used with a conservative lag
(period end + 90 calendar days).

## 4. Production price cache holds ~3.4 years

`HISTORY_TRADING_DAYS` = 849. Deeper history (to ~2016) is available from the
provider and is fetched by the Alpha Lab separately; production stays on the
shallow cache deliberately — the interface never needs a decade of closes.

## 5. No intraday data, no spreads

Cost modelling in backtests uses assumed per-trade costs rather than measured
spreads. Turnover comparisons between signals remain valid; absolute net
returns carry the assumption.
