# Research Registry

Every experiment is recorded here **before** it runs and updated with its
result. This is the multiple-testing ledger: a signal that reaches production
must have a paper trail from hypothesis to out-of-sample decision. Failed
ideas stay listed — knowing what did not work is part of the record.

Schema per entry:

- **ID** — sequential, e.g. R-001
- **Hypothesis** — the economic/behavioral claim, stated before testing
- **Signal definition** — exact calculation and parameters
- **Expected direction** — stated before testing
- **Date tested**
- **In-sample result**
- **Out-of-sample result**
- **Decision** — promote to challenger / keep in lab / reject
- **Notes** — data limitations, caveats

---

## R-001 — 12−1 price momentum (V1 baseline validation)

- **Hypothesis**: intermediate-horizon winners keep winning (underreaction /
  slow information diffusion); the skipped month removes short-term reversal.
- **Signal**: total return over 252 trading days ending 21 days ago (V1 `12-1`).
- **Expected direction**: positive forward IC at 21/63/126d.
- **Date registered**: 2026-08-19.
- **Date tested**: 2026-08-19 (Lab run 32233508665: 1,498 names, 116 monthly dates, 2016-06→2026-02).
- **Result**: weak unconditionally — 21d IC +0.002 (t 0.2), 126d IC +0.012. Violently regime-dependent: by-year mean IC ranges −0.104 (2016) to +0.086, positive in 2017/2020/2022/2024/2026, negative in 2016/2019/2021/2023/2025.
- **Decision**: remains the control. The decade-average is not the point; the regime structure is, and it makes the momentum-regime overlay (directive §19) the highest-priority research item.
- **Notes**: survivorship-biased universe damps momentum spreads (crashed losers that left the index are missing). This is the control every V2 signal must beat or complement.

## R-002 — 6−1 price momentum

- **Hypothesis**: the same effect at half the formation window; noisier but
  faster to reflect new strength.
- **Signal**: V1 `6-1` (126d formation, 21d skip).
- **Expected direction**: positive IC, likely below 12−1 at long horizons.
- **Date registered**: 2026-08-19.
- **Date tested**: 2026-08-19.
- **Result**: the strongest baseline — positive IC at every horizon (21d +0.006, 63d +0.012, 126d +0.026 t 2.1*), top−bottom +3.03% at 126d, IC>0 61% of dates. Same regime flips as 12−1 but shallower.
- **Decision**: keep; becomes the bar any V2 composite must clear.

## R-003 — Raw 12M return

- **Hypothesis**: without the skip, short-term reversal contaminates the
  signal; expected positive but weaker than 12−1.
- **Signal**: V1 `12M`.
- **Expected direction**: positive IC, below 12−1.
- **Date registered**: 2026-08-19.
- **Date tested**: 2026-08-19.
- **Result**: ≈0 at every horizon (21d −0.001, 126d +0.008); weaker than both skipped variants, as hypothesised.
- **Decision**: keep as control only.

## R-004 — Residual 12M momentum

- **Hypothesis**: stripping segment-benchmark exposure isolates
  stock-specific strength, which persists more reliably than market-driven
  strength (residual momentum literature).
- **Signal**: V1 residual — 12M return − β × benchmark 12M, β over 756d.
- **Expected direction**: positive IC; more stable across years than raw
  momentum.
- **Date registered**: 2026-08-19.
- **Date tested**: 2026-08-19.
- **Result**: modest but the most consistent — 126d IC +0.016 with IC>0 on 64% of dates (highest of any signal), lowest top-decile turnover (26%). 21d ≈0.
- **Decision**: keep; stability profile supports the hypothesis, magnitude does not yet clear 6−1.

## R-005 — Positive-day share (trend persistence)

- **Hypothesis**: information arriving in a steady stream (frequent small
  up-days) marks durable trends; the "frog in the pan" effect.
- **Signal**: share of up days over 252d.
- **Expected direction**: positive IC.
- **Date registered**: 2026-08-19.
- **Date tested**: 2026-08-19.
- **Result**: not supported — IC ≈0, decile spreads negative (−6.07% at 126d, anti-monotone −0.79).
- **Decision**: keep in lab, deprioritised. Survivorship caveat: choppy recovered losers are over-represented among today's members.

## R-006 — Top-5-day concentration (discreteness)

- **Hypothesis**: returns concentrated in a few jumps mark event-driven,
  lottery-like names whose momentum follow-through is weaker.
- **Signal**: share of the 252d log return earned on its 5 largest up days;
  smaller ranks better.
- **Expected direction**: positive IC for the inverted (asc) ranking.
- **Date registered**: 2026-08-19.
- **Date tested**: 2026-08-19.
- **Result**: weak support at 126d only — IC +0.012, monotonicity +0.83, spread +2.29%; nothing at 21d.
- **Decision**: keep in lab. The one path signal with the hypothesised shape.

## R-007 — Closeness to 52-week high

- **Hypothesis**: anchoring on the high makes investors slow to bid a name
  through it, so proximity to the high predicts continuation
  (George & Hwang).
- **Signal**: price / trailing-252d high.
- **Expected direction**: positive IC.
- **Date registered**: 2026-08-19.
- **Date tested**: 2026-08-19.
- **Result**: REJECTED in this sample — sign opposite to hypothesis at every horizon (126d IC −0.011, spread −8.51%, monotonicity −0.98: names far below their high outperformed almost perfectly monotonically).
- **Decision**: reject for promotion. This is also the signal most contaminated by survivorship — a beaten-down name in a current-members universe is a guaranteed survivor — so the negative result cannot be read as clean mean-reversion evidence either. Revisit only with point-in-time membership (forward record).

## R-008 — Time near the high

- **Hypothesis**: consolidation just under the high (many recent days within
  5%) marks absorbed supply rather than a single touch-and-fail.
- **Signal**: share of last 63 days within 5% of the running 252d high.
- **Expected direction**: positive IC.
- **Date registered**: 2026-08-19.
- **Date tested**: 2026-08-19.
- **Result**: flat (21d +0.005, 126d +0.014, negative spreads).
- **Decision**: not supported; keep in lab, deprioritised.

## R-009 — Momentum agreement

- **Hypothesis**: strength confirmed across independent horizons (12−1, 6−1,
  3M, 12M) is more durable than strength at one arbitrary endpoint.
- **Signal**: mean percentile across the four horizons (graded form of the
  displayed n-of-4 count).
- **Expected direction**: positive IC, above any single horizon's.
- **Date registered**: 2026-08-19.
- **Date tested**: 2026-08-19.
- **Result**: hypothesis NOT met — 126d IC +0.017 vs 6−1's +0.026; agreement does not beat its best member.
- **Decision**: keep the displayed n-of-4 count as descriptive context only; no ranking role.

## R-010 — Alpha Score v2 (price-only composite)

- **Hypothesis**: combining independent families (price, residual, trend,
  industry) under the declared prior weights beats every single family, and
  removing any one family degrades it (ablation to follow if the composite
  clears its baselines).
- **Signal**: `alpha-v2` — see src/domain/alpha.ts.
- **Expected direction**: IC ≥ best single family; lower turnover than 3M.
- **Date registered**: 2026-08-19.
- **Date tested**: 2026-08-19.
- **Result**: hypothesis NOT met — tracks momentum closely (by-year ICs nearly identical to 12−1), 126d IC +0.018 < 6−1's +0.026; the trend family drags. Turnover fine (30%).
- **Decision**: stays in research. Price-only families are too correlated to compose into anything better than the best single member; the composite's case now rests on adding orthogonal information (fundamental momentum) and on regime conditioning.

## R-011 — Drawdown regime

- **Hypothesis**: when the market is at least 10% below its trailing-year
  high, momentum's loser leg is crowded with high-beta fallen names and the
  strategy's asymmetry worsens; momentum-family ICs are materially lower in
  this state.
- **Signal (regime)**: SPY close < 90% of its trailing 252-day high →
  `adverse`, else `normal`. Threshold fixed a priori (the conventional
  correction line), not fitted.
- **Expected direction**: momentum ICs in `adverse` < `normal`.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-012 — Trend regime

- **Hypothesis**: momentum works when the market itself has intermediate
  trend; a negative market halts continuation.
- **Signal (regime)**: SPY 126-day return < 0 → `adverse`. Threshold zero,
  fixed a priori.
- **Expected direction**: momentum ICs in `adverse` < `normal`.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-013 — Volatility regime

- **Hypothesis**: high market volatility marks the environments where
  momentum's tail risk lives.
- **Signal (regime)**: SPY 63-day realised volatility > 20% annualised →
  `adverse`. Threshold fixed a priori (the conventional VIX-20 line).
- **Expected direction**: momentum ICs in `adverse` < `normal`.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-014 — Rebound regime (crash signature)

- **Hypothesis**: momentum crashes concentrate in sharp rebounds off lows —
  the market still well below its high but rallying hard — when the
  beaten-down loser leg squeezes upward (Daniel & Moskowitz).
- **Signal (regime)**: SPY ≥10% below its 252-day high **and** SPY 21-day
  return > +5% → `adverse`. Both thresholds fixed a priori.
- **Expected direction**: the most negative momentum ICs of any state;
  expected rare.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-015 — Dispersion regime

- **Hypothesis**: unusually wide cross-sectional dispersion marks unstable
  leadership; ranking today's winners is less informative about tomorrow's.
- **Signal (regime)**: interquartile range of the universe's 63-day returns
  above its own **expanding median of past rebalance dates** → `adverse`.
  Adaptive but strictly point-in-time — each date's threshold uses only
  earlier dates; nothing is fitted on the full sample.
- **Expected direction**: momentum ICs in `adverse` < `normal`.
- **Date registered**: 2026-08-19. **Result**: pending.
