# Duo Planning Backlog

These are candidate directions and ideas, not commitments. Nothing here is
approved automatically. The user may choose an item, modify it, combine
items, or provide a different blueprint. `AGENTS.md` remains authoritative
for workflow — this document has no effect on how work happens, only on
what might be worth doing next.

## Near-term portfolio foundation

- **Tap-to-select stocks**
  - Tap a row to select or deselect it.
  - Support multiple selections.
  - Persist selections locally.
  - Sorting and sector filtering do not clear selections.

- **Selected-row visual treatment**
  - Preserve Duo's black/white design.
  - A selected row uses an inverted white background with black content.
  - Avoid stars, checkboxes, or extra permanent controls unless later needed.

- **Inverse-volatility portfolio weights**
  - Use the existing volatility metric.
  - Normalize 1 / volatility across selected stocks.
  - Show percentage weight.
  - Exclude names without valid volatility from normalization and identify
    them clearly.

- **Portfolio amount**
  - Default $30,000.
  - User editable.
  - Persist locally.
  - Convert percentage weights to dollar allocations.
  - Show both % and $.
  - Dollar allocations rounded sensibly.

- **Selected-only view**
  - Quick switch between the full ranking and the selected portfolio.
  - Preserve each stock's relevant rank/context.

## Easy portfolio wins

- Selected count
- Clear selection
- "X of 399 selected"
- Sector count
- Largest sector exposure
- Largest position
- Weight concentration warning
- Total allocated
- Remaining cash
- Sticky compact portfolio summary
- Select Top 5 / Top 10 / Top 20 from the current ranking
- Copy portfolio as ticker / weight / dollar allocation
- Average selected volatility
- Median selected volatility
- Average selected 12–1 return
- Average selected residual return
- Best metric value among selected names
- Lowest-volatility selected name
- Responsive tap feedback

## Portfolio risk engine

- **Covariance engine**
  - Align selected stocks' daily returns.
  - Calculate sample covariance.
  - Annualize consistently with Duo's volatility calculations.
  - Use as the mathematical foundation for portfolio risk.

- **Portfolio volatility**
  - Calculate from weights and the covariance matrix using wᵀΣw.

- **Correlation matrix**
  - User-facing matrix for selected stocks.
  - Prefer correlation for visual interpretation even if covariance remains
    the calculation engine.

- **Covariance matrix**
  - Available as a secondary analytical view if useful.
  - Do not make raw covariance the primary phone interface.

- **Diversification benefit**
  - Show whether combining the selected holdings meaningfully reduces risk.

- **Position risk contribution**
  - Show how much each holding contributes to total portfolio risk.

- **Portfolio vs IJH**
  - Compare selected-portfolio performance with the IJH benchmark over an
    appropriate common period.

## Ranking and metric expansion

- **6–1 momentum**
  - Return from six calendar months ago through one month ago.
  - Use the existing configurable window-return machinery where appropriate.

- **63-day rank change**
  - Identify the strongest climbers and fallers in ranking position.

- **Residual volatility**
  - Evaluate whether it is useful as a standalone display/ranking metric.

- **Residual return ÷ residual volatility**
  - Treat as an empirical candidate.
  - Test whether it adds useful information beyond residual return alone
    before promoting it to a core metric.

- **Scalable narrow-screen metric layout**
  - Avoid squeezing every future metric into permanent columns.
  - On narrow phones, prioritize the active metric plus limited secondary
    context.

## Ticker detail and graphing

- **Long-press ticker detail**
  - Keep a normal tap reserved for portfolio selection.
  - Long-press opens ticker detail.

- **Price graph**
  - Proper adjusted-close price-vs-time chart.
  - Default 1Y.
  - Toggles: 6M · 1Y · 3Y.
  - Show ticker and company name.
  - Show current price and period return.
  - Minimal black/white treatment.
  - No rank sparkline.

- **Detail-view navigation**
  - Return to the prior ranking position cleanly.

## Later execution features

- **Whole-share portfolio implementation**
  - Convert dollar targets into share counts using the latest price.
  - Show resulting invested amount and leftover cash.
  - Keep separate from the initial fractional-dollar weighting work.

## Planning priority

The current preferred sequence, recorded as guidance, not approval:

1. Selection + inverse-volatility weighting
2. Covariance engine + portfolio volatility
3. Selected-only portfolio experience and easy summary wins
4. Proper ticker price graph
5. 6–1 momentum
6. Additional portfolio/ranking analytics

---

This backlog records possibilities. Before implementation, the user may
review the live frontend and repository, revise the idea, and provide
Agent 1 with a more specific PR blueprint.
