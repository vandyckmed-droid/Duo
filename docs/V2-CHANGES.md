# V2 — What Changed and Why It Is Defensible

V2 is V1 plus two restrained, reversible adjustments, each supported by both
the internal research program (docs/RESEARCH-REGISTRY.md, 18 registered
experiments over 1,498 names and up to 220 monthly walk-forward dates,
2007–2026) and long-standing published evidence. The standard applied is
*defensible, useful, and transparent* — not novel. Nothing here changes how
any stock is ranked by default.

## 1. The market regime line

**What changed.** The ranked list carries one factual sentence: the market
momentum regime — *Normal*, *Caution*, or *Reversal risk* — computed from
SPY at the dataset's as-of date. Caution means the market is >10% below its
trailing-year high or negative over six months; Reversal risk means deep
below the high *and* rallying hard over the last month. The three inputs are
published in the manifest so the sentence is checkable. Rankings are
untouched; no exposure advice is given.

**Internal evidence (R-011, R-012, R-014, R-016).** Across 220 monthly
dates, 2007–2026, momentum-family rank ICs averaged +0.017…+0.021 in the
normal state and −0.043…−0.070 in drawdown/negative-trend states; the split
held in both the 2016–2026 and full samples. The rebound signature fired 8
times in 19 years and averaged −0.13…−0.17 — the worst readings anywhere in
the study. Unconditionally, momentum ICs over the full period were ≈0: on
this universe the signal's usefulness is essentially regime-conditional.

**Published evidence.**
- Cooper, Gutierrez & Hameed (2004), "Market States and Momentum," *Journal
  of Finance* 59(3): momentum profits follow positive market states and
  disappear (or invert) after down markets — the same structure the Lab
  found, on independent data and decades.
- Daniel & Moskowitz (2016), "Momentum Crashes," *Journal of Financial
  Economics* 122(2): momentum's worst episodes cluster in sharp rebounds
  off market lows — the Reversal-risk signature.
- Barroso & Santa-Clara (2015), "Momentum Has Its Moments," *Journal of
  Financial Economics* 116(1): momentum's risk is predictable enough to
  manage — supporting the usefulness of telling the user *when* the signal
  is fragile.

**Why restrained.** Display-only, thresholds fixed and pre-registered (90%
of the high; 0% six-month return; +5% one-month rally), inputs published,
and removable by deleting one manifest field and one component line.

## 2. The EPS surprise metric

**What changed.** `EPS surprise` (SUE) joins the metric registry as a
selectable ranking variable — never the default. Definition on the metric
itself: latest quarter's actual EPS minus the consensus estimate at
announcement, as a share of the announcement-day price; only announcements
from the last 63 trading days count; names without one are set aside, not
ranked last. The ticker detail gains a *Latest earnings* section
(announcement date, actual vs estimate, surprise, return since).

**Internal evidence (R-017).** The strongest single result of the program:
21-day forward IC +0.009 with t = 2.3 over 220 non-overlapping monthly
dates, positive in 16 of 20 calendar years, top-decile turnover 27% — and
nearly regime-neutral (+0.012 in drawdown-normal states, −0.002 in adverse)
where every price-momentum signal swings violently. It is the one signal
tested that carries information *orthogonal* to price momentum.

**Published evidence.**
- Ball & Brown (1968), *Journal of Accounting Research* 6(2): prices
  continue to drift in the direction of earnings news after announcement —
  the original documentation.
- Bernard & Thomas (1989), "Post-Earnings-Announcement Drift," *Journal of
  Accounting Research* 27: the drift persists for weeks to months and is
  strongest in the direction of the surprise; one of the most replicated
  results in empirical accounting.
- Foster, Olsen & Shevlin (1984), *The Accounting Review* 59(4): drift
  magnitude scales with the size of the surprise.
- Chan, Jegadeesh & Lakonishok (1996), "Momentum Strategies," *Journal of
  Finance* 51(5): earnings momentum and price momentum are related but
  distinct sources of predictability — the orthogonality the Lab measured.

**Why restrained.** A selectable metric among ten, not a default; the
ingestion is two short calendar requests per daily run; every announcement
is frozen at first capture so later estimate restatements can never rewrite
history; and removal is deleting one registry entry and one optional
dataset block.

## Grounding for what V1 already had

- 12−1 and 6−1 momentum: Jegadeesh & Titman (1993), *Journal of Finance*
  48(1) — intermediate-horizon winners persist; the skipped month avoids
  short-term reversal.
- Residual momentum: Blitz, Huij & Martens (2011), *Journal of Empirical
  Finance* 18(3) — beta-stripped momentum with lower crash risk. Internally
  the most *consistent* signal tested (IC > 0 on 64% of dates, lowest
  turnover). v2.2 replaces the named metric strip with a dimensional
  selector: one window control (12M | 6M) and three independent toggles
  (Skip 1M, Residual, ÷ Vol) compose all sixteen combinations through one
  shared implementation — exposing ranking dimensions rather than every
  permutation. Residual subtracts β × the segment benchmark (β from three
  years of daily returns, intercept fitted but never subtracted); ÷ Vol
  divides by the same window's own volatility, of the residuals themselves
  when Residual is on (the BHM construction proper). Standalone statistics
  (3M, R/V, VOL, β, SUE, Δ rank, cap) moved behind the Filters disclosure —
  they are metrics, not dimensions.

## Considered and not adopted

- **52-week-high proximity as a ranking** (George & Hwang 2004, *Journal of
  Finance* 59(5)): internally the decile curve ran almost perfectly the
  wrong way (R-007) — though this is also the signal most contaminated by
  survivorship bias in a current-members universe. The 52-week range stays
  what it was in V1: visual context.
- **Momentum agreement as a ranking** (R-009): did not beat its best member.
- **A price-only composite score** (R-010): its inputs are correlated views
  of one price series; it could not beat 6−1. A composite becomes worth
  retesting only with the fundamental family inside it.
- **A fixed volatility-threshold regime** (R-013): its verdict flipped
  between samples; drawdown and trend carry the same information stably.
- **Changing the default metric to 6−1**: internally 6−1 was the stronger
  baseline in the recent decade, but over 19 years neither variant is
  unconditionally strong, and a default is product identity — left to an
  explicit future decision, not slipped into a release.

## The forward record

The daily prediction recorder (append-only `prediction-record` branch)
snapshots exactly what production served, starting 2026-08-18. It exists
because every backtest above shares one flaw — today's index members
projected backwards — and only accumulated forward data can retire it.
Adjustments that survive the forward record earn more trust; ones that
don't will be removed the same way they arrived.
