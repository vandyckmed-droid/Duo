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
- **Date registered**: 2026-08-19. **Result**: pending first Lab run.
- **Notes**: this is the control every V2 signal must beat or complement.

## R-002 — 6−1 price momentum

- **Hypothesis**: the same effect at half the formation window; noisier but
  faster to reflect new strength.
- **Signal**: V1 `6-1` (126d formation, 21d skip).
- **Expected direction**: positive IC, likely below 12−1 at long horizons.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-003 — Raw 12M return

- **Hypothesis**: without the skip, short-term reversal contaminates the
  signal; expected positive but weaker than 12−1.
- **Signal**: V1 `12M`.
- **Expected direction**: positive IC, below 12−1.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-004 — Residual 12M momentum

- **Hypothesis**: stripping segment-benchmark exposure isolates
  stock-specific strength, which persists more reliably than market-driven
  strength (residual momentum literature).
- **Signal**: V1 residual — 12M return − β × benchmark 12M, β over 756d.
- **Expected direction**: positive IC; more stable across years than raw
  momentum.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-005 — Positive-day share (trend persistence)

- **Hypothesis**: information arriving in a steady stream (frequent small
  up-days) marks durable trends; the "frog in the pan" effect.
- **Signal**: share of up days over 252d.
- **Expected direction**: positive IC.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-006 — Top-5-day concentration (discreteness)

- **Hypothesis**: returns concentrated in a few jumps mark event-driven,
  lottery-like names whose momentum follow-through is weaker.
- **Signal**: share of the 252d log return earned on its 5 largest up days;
  smaller ranks better.
- **Expected direction**: positive IC for the inverted (asc) ranking.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-007 — Closeness to 52-week high

- **Hypothesis**: anchoring on the high makes investors slow to bid a name
  through it, so proximity to the high predicts continuation
  (George & Hwang).
- **Signal**: price / trailing-252d high.
- **Expected direction**: positive IC.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-008 — Time near the high

- **Hypothesis**: consolidation just under the high (many recent days within
  5%) marks absorbed supply rather than a single touch-and-fail.
- **Signal**: share of last 63 days within 5% of the running 252d high.
- **Expected direction**: positive IC.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-009 — Momentum agreement

- **Hypothesis**: strength confirmed across independent horizons (12−1, 6−1,
  3M, 12M) is more durable than strength at one arbitrary endpoint.
- **Signal**: mean percentile across the four horizons (graded form of the
  displayed n-of-4 count).
- **Expected direction**: positive IC, above any single horizon's.
- **Date registered**: 2026-08-19. **Result**: pending.

## R-010 — Alpha Score v2 (price-only composite)

- **Hypothesis**: combining independent families (price, residual, trend,
  industry) under the declared prior weights beats every single family, and
  removing any one family degrades it (ablation to follow if the composite
  clears its baselines).
- **Signal**: `alpha-v2` — see src/domain/alpha.ts.
- **Expected direction**: IC ≥ best single family; lower turnover than 3M.
- **Date registered**: 2026-08-19. **Result**: pending.
