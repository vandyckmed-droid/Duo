# V2 Directive — V1 Is the Control

V1 (tag `v1.0`, branch `v1-stable`, commit `da87d8f`) is a successful finished
product and the permanent control group. V2 is a challenger, not a successor.
Never merge V2 without the owner's explicit approval. Failure is an acceptable
V2 outcome; the existence of the branch creates no obligation to merge it.

## Ground rules

- `main` remains V1 and production (GitHub Pages) remains V1 throughout.
- All V2 work happens on one continuous development PR from the frozen commit.
- Do not modify `v1-stable`. Do not alter V1 to make V2 convenient.
- Extend the V1 boundaries (ingestion → metadata → price cache → calculation
  engine → ranking engine → published dataset → interface); never collapse them.
- New ranking variables plug into the existing metric registry; no separate
  interfaces. Prefer additive changes with easy removal over migrations.
- Experimental behavior lives behind a development-only challenger mechanism,
  invisible to the normal interface. No V2 system becomes a default merely
  because it is implemented — promotion is: research → challenger → validated →
  candidate; the final decision belongs to the owner.

## The V2 objective

V1 answers "what has been strongest?". V2 must improve the selection of stocks
with superior *future* returns — more intelligence underneath, not more
complexity on top. The interface stays almost absurdly simple.

## Architecture requirements

- **Alpha, risk, and portfolio fit stay separate.** Return is primary; risk
  modifies the decision, it does not define it. Selection (which stocks) is
  decided before weighting (how much).
- **Signal families**, each transparent and individually inspectable:
  price momentum (multi-horizon + agreement), residual momentum (market →
  sector → multi-factor, promoted only on out-of-sample evidence), fundamental
  momentum (changes in expectations over levels; strictly point-in-time),
  trend quality (persistent vs discrete paths), quality (confirmation, not a
  screener), industry/relative strength (market → sector → industry → stock).
- **Signal Agreement**: how many independent families support the same
  conclusion; displayed simply (e.g. "5 / 6 positive"), components behind
  progressive disclosure.
- **Alpha Score**: rank/percentile-normalized composite with winsorization and
  explicit missing-data handling. Initial family weights (research priors, to
  be tested, not optimized in-sample): price 30 / residual 25 / fundamental 20 /
  trend 10 / quality 10 / industry 5. Simple, rounded, slow-moving weights.
  Every score decomposable per stock: "why is A above B?" must have an answer.
- **Acceleration**: rank change over 21/63 days; strong vs strengthening vs
  weakening vs reversing; Climbers/Fallers as discovery modes. Test whether
  acceleration is actually bullish — do not assume.
- **Risk engine** (separate from alpha): volatility, downside vol, beta,
  drawdowns, idiosyncratic vol, correlations, liquidity, concentration.
- **Momentum crash regime + market trend overlay**: several transparent
  candidate definitions, tested out of sample; used for portfolio exposure
  (long-only, 0–100%, unused budget → cash), not for stock scores.
- **Portfolio**: alpha-aware weighting researched against equal weight,
  alpha tilt, inverse vol, HRP; correlation clusters reduce redundant
  concentration (correlation is a concentration input, not a veto); sector
  caps optional; entry/exit hysteresis bands (test the thresholds);
  turnover is a cost — evaluate net-of-cost.

## Alpha Lab (offline research subsystem)

Every signal passes through the Lab before entering the production Alpha Score.

- **Point-in-time is non-negotiable**: every feature has a date on which it
  became knowable and is used only after it. No revised history, no fabricated
  estimates. Unavoidable limitations are detected and documented (see
  docs/DATA-LIMITATIONS.md).
- **Walk-forward only** (chronological). Never shuffled train/test.
- **Baselines**: SPY, equal-weight universe, V1 12−1, V1 6−1, V1 residual,
  simple top-N momentum.
- **Rank predictiveness** directly: forward 21/63/126/252-day IC, decile and
  quintile returns, monotonicity, hit rate, persistence — not only portfolio
  paths.
- **Ablations**: full model vs model-minus-each-family; a signal that changes
  nothing when removed is deleted.
- **Regime testing**: bull/bear, high/low vol, leadership regimes, decades as
  data allows.
- **Multiple-testing discipline**: every experiment recorded in
  docs/RESEARCH-REGISTRY.md (hypothesis, definition, date, expectation,
  result, out-of-sample result, decision) before and after it runs.
- **Promotion standard**: economic rationale + clean point-in-time construction
  + forward predictiveness + out-of-sample contribution + regime stability +
  acceptable turnover + additive in ablation + reliable implementation.
  Marginal evidence stays in the Lab.
- **ML is a challenger only**: interpretable methods first, same inputs as the
  transparent model, judged on untouched chronological data; the transparent
  model remains the production benchmark.
- **Prediction tracking**: once live, every day's scores are preserved
  immutably with subsequent realized returns; never recomputed retroactively.

## Priority order when tradeoffs arise

1. point-in-time correctness, 2. future-return predictiveness, 3. out-of-sample
robustness, 4. alpha transparency, 5. net-of-cost return, 6. drawdown
survivability, 7. diversification, 8. interface simplicity, 9. more signals.

## What V2 must not become

An indicator zoo, a black box, an overfit backtester, an earnings dashboard, a
fundamentals database, a macro app, a day-trading system, or a generic
multi-factor screener.

## Final checkpoint

When V2 work is complete: do not merge. Present V1 vs V2 covering interface,
speed, complexity, ranking differences, forward evidence, risk, reliability,
and a recommendation (promote all / promote parts / V1 remains). Stop there.

The critical experiment: does V2 select stocks that subsequently outperform
V1's selections, after realistic costs, across unseen periods and regimes?
If yes, keep it. If no, V1 wins. The goal is the simplest model that
repeatedly selects better stocks.
