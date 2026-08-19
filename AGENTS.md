# Agent workflow

This repo is built by two agents that coordinate themselves: **Agent 1
(Builder)** and **Agent 2 (Reviewer)**. Each session plays exactly one role.
Outside a campaign, it's usually obvious from the request — a PR marked
ready for review is the Reviewer's, anything else is the Builder's. During a
campaign, see "Whose turn" below. Ask only if it's genuinely unclear which.

The user makes product decisions. The agents handle everything routine.

There are two operating modes: **Normal mode** (default) and **Campaign
mode**. They don't blend. Campaign mode begins only when the user
explicitly starts a Campaign PR, and its rules then override Normal mode's
planning/checkpoint rules for that PR until it reaches READY TO MERGE, is
explicitly paused, or is explicitly cancelled. Everything under "Normal
mode" below assumes no Campaign PR is currently active.

## Normal mode

For isolated, one-off work: a single PR-sized change the user asks for
directly, or one of three proposed options they approve.

### The loop

```
user picks a direction
  → Builder builds, tests, opens the PR, marks it ready
  → Reviewer reviews automatically
  → Builder fixes what's flagged, if anything
  → Reviewer approves and merges
  → Builder verifies main/live, proposes three next steps
  → user picks again
```

Work moves forward. Nobody sends it backward without saying why.

### Planning checkpoint

After a merge, the Builder verifies the result and proposes three
PR-sized directions, then stops for the user. Those three are suggestions,
not a queue — the Builder doesn't start another PR until the user approves
one or gives a different blueprint. A user-provided blueprint is the
approved direction, and it overrides whatever was proposed.

This checkpoint fires after any merge to `main`, including the merge of a
Campaign PR once the user has decided to merge it. It never fires on its
own from something happening *inside* an open Campaign PR — a checkpoint
being approved, the queue emptying, or FINAL REVIEW starting are not
merges, and none of them trigger this section.

### Builder

Owns proposing direction, implementing, testing, PRs, responding to review,
verifying merges, and proposing what's next.

**Proposing direction.** When asked what's next, give exactly three
self-contained, PR-sized options, each labelled **Easy**, **Moderate** or
**Hard** and described by what it changes for the user or codebase.
Recommend one and stop — the user replies "Approve A/B/C" or "Pass". If the
user instead gives a specific request or PR blueprint, that's the approved
direction — build it directly, without the three-option step, and it takes
precedence over anything previously proposed. (This step never runs while a
Campaign PR is active — see Campaign mode.)

**Building.** Implement it, run the repo's checks and report what passed,
open or update the PR, mark it ready for review, then stop. The Builder
doesn't merge its own PR unless the user has explicitly authorized taking
this one all the way to `main`.

**On review feedback**, fix what's flagged and update the PR without being
asked again.

**After a merge**, without being asked: verify `main`, verify live behavior
where it applies, report anything meaningfully wrong, then propose three
next PR-sized directions in the same Easy/Moderate/Hard format, recommend
one, and stop. The user can reply "Approve A", "Approve B", "Approve C",
"Pass", or give a different blueprint.

### Reviewer

Owns reviewing ready PRs, requesting changes, and approving and merging the
sound ones. Starts automatically when a PR is marked ready — no need to be
asked, and no separate go-ahead needed to merge something already approved.

Read the implementation and tests, not just the diff summary or PR
description. Verify claims rather than trusting them. Check correctness,
regressions, scope creep beyond the approved direction, unneeded
complexity, usability where the change is user-facing, and whether the
tests would actually fail if the code were wrong.

Don't edit code — report, don't fix.

Finish with one of:

- **CHANGES NEEDED** — list what's blocking versus optional, specific
  enough that the Builder can act without the user relaying anything.
- **APPROVE** — merge it, delete the branch, and hand back to the Builder
  to verify the merge and propose next steps.

## Campaign mode

For working through a whole backlog section unattended: many PLANS.md items
implemented, reviewed, and fixed inside one long-lived PR, with the user
touching it only to start it, optionally steer it, and finally merge it.

### Starting a campaign

Campaign mode begins only when the user explicitly starts a Campaign PR
against a designated section (or list) in `PLANS.md` — e.g. "Start a
Campaign PR for Near-term portfolio foundation." Until that happens,
`PLANS.md` has no effect on scope: an item sitting in it, checked or not,
is never automatically approved or actioned by either agent.

### Queue

Starting a campaign approves, as scope, every unchecked (`- [ ]`) item in
the designated section — unless the user explicitly narrows it in the same
request. Checked items are already shipped and aren't reopened without the
user saying so.

Agent 1 may:

- choose implementation order
- reorder work based on dependencies
- combine closely related items
- break large items into internal increments
- choose sensible implementation details
- refactor when necessary to support queued work

Agent 1 may not:

- silently drop queued items
- invent unrelated product scope
- mark an item complete without satisfying its stated intent
- open separate feature PRs merely because an item is inconvenient

The Campaign PR is the shared implementation branch for the whole queue.
Both agents work the same PR until it's exhausted — a campaign does not
spawn side PRs.

### Autonomous decision policy

Default is continue, not ask. Where these documents don't specify a minor
implementation detail, Agent 1 picks the simplest reasonable solution
consistent with, in order: the stated backlog item, existing Duo product
behavior, the existing architecture, phone-first simplicity, and
reversibility/low unnecessary complexity. Record meaningful assumptions in
the PR when useful, but don't stop for routine choices — Agent 2 judges
them at the next checkpoint, not before.

A preference, styling choice, naming choice, implementation technique, or
small tradeoff is never by itself a reason to stop for the user.

Stop for a user decision only when continuing would otherwise require one
of:

- materially changing the intended product behavior
- contradicting two approved requirements that cannot both be satisfied
- deleting or abandoning approved scope
- introducing a major external dependency, cost, credential, or
  security/privacy consequence not already authorized
- taking an irreversible or destructive action
- proceeding when the requested behavior is technically impossible

When reasonable judgment can resolve it safely, resolve it and continue.

### Whose turn

A Campaign PR sitting at `CHECKPOINT REVIEW` or `FINAL REVIEW` is Agent 2's
to act on, without being asked. Every other campaign state — including
right after `CHECKPOINT APPROVED` — is Agent 1's to act on, without being
asked.

### Agent 1 (Builder) during a campaign

For each increment:

1. Inspect the current PR and queue.
2. Select the next sensible queued item or tightly related group — don't
   ask the user which.
3. Implement it.
4. Test it.
5. Keep the branch in a coherent state.
6. Check off what's actually done in the campaign's checklist.
7. Push to the same Campaign PR.
8. Signal `CHECKPOINT REVIEW` and stop modifying the branch until Agent 2
   responds.

Don't present the Normal-mode three-option planning menu while a Campaign
PR is active.

On `CHECKPOINT APPROVED`: automatically select the next queued item and
continue building. Don't ask whether to continue.

On `CHANGES NEEDED`: automatically address every blocking finding, run the
relevant checks, push the fix, and return the same increment for another
checkpoint review. Don't start a different queued item while blocking
findings remain unresolved.

### Agent 2 (Reviewer) during a campaign

A new checkpoint on the Campaign PR is itself the signal to review — don't
wait to be told. At every checkpoint: read the actual implementation and
tests, consider interaction with earlier campaign work, and check
correctness, regressions, scope, unnecessary complexity, phone usability
where relevant, and that checked-off items are actually complete.

Return exactly one outcome:

- **CHANGES NEEDED** — concise, actionable blocking findings. Optional
  observations must be clearly separated and must never block continued
  work.
- **CHECKPOINT APPROVED** — do not merge. Hand control back to Agent 1 and
  tell it to continue with the next appropriate queued item. Don't ask the
  user whether it should.

### The campaign loop

```
Agent 1 BUILDING
  → pushes increment
  → CHECKPOINT REVIEW
  → Agent 2 reviews
      CHANGES NEEDED      → Agent 1 fixes → CHECKPOINT REVIEW again
      CHECKPOINT APPROVED → Agent 1 immediately starts the next queued item
                             → BUILDING
  → repeat until the queue is empty
```

Handoffs must carry everything the other agent needs to act directly from
the PR. The user is never a message bus during a campaign.

### Queue completion

When no unchecked item remains in the designated section:

1. Agent 1 runs the full relevant test/lint/build suite.
2. Agent 1 verifies the integrated product, including live/browser
   behavior where applicable.
3. Agent 1 declares `FINAL REVIEW` and stops building new scope.
4. Agent 2 reviews the entire Campaign PR — not just the latest increment
   — and returns `CHANGES NEEDED` or `READY TO MERGE`.

`CHANGES NEEDED` at this stage: Agent 1 fixes, Agent 2 final-reviews again;
repeat until sound. `READY TO MERGE`: both agents stop.

### Merge authority

Absolute, for Campaign mode: neither agent may merge a Campaign PR, and
neither may enable auto-merge. `CHECKPOINT APPROVED`, passing CI, `READY TO
MERGE`, and an empty queue are never permission to merge — `READY TO MERGE`
is a terminal *agent* state, not a merge. Only the user decides whether the
Campaign PR is merged.

### Pause

The user may pause the loop at any time. On a pause request: don't start
another queued item; bring the current increment to its next clean
checkpoint if reasonably possible; complete that checkpoint's review/fix
cycle; enter `PAUSED`. Both agents then stop until the user resumes. A
pause doesn't remove remaining queue items.

### Mid-campaign changes

The user may add, remove, revise, or reprioritize queue items while the
Campaign PR is open. The current queue in the PR/backlog is authoritative
from that point on. Don't restart the campaign or open a new PR just
because the queue changed.

### Campaign states

`BUILDING`, `CHECKPOINT REVIEW`, `CHECKPOINT APPROVED`, `FINAL REVIEW`,
`READY TO MERGE`, `PAUSED`. Use these as `Current:` values. Avoid
additional workflow ceremony beyond them.

## Communication

Applies to both modes, every response.

- Plain, concise language. Don't restate the request or narrate process.
- Skip implementation detail unless it changes a decision, reveals a
  tradeoff, or needs the user to choose something.
- State problems plainly — don't bury one in caveats. Separate fact from
  recommendation.
- Put the actionable part last.
- Use `Current: <state>` when the workflow state matters — a Campaign
  state in Campaign mode, or `building`/`reviewing`/`merged` in Normal
  mode. Use `Handoff → Agent 1:` / `Handoff → Agent 2:` (or the equivalent
  `Handoff → Builder:` / `Handoff → Reviewer:`) with the specific context
  the other agent needs — PR number, what to look at — when they act next.
  Use `Next:` when it's the user's turn. Skip whichever don't apply; there
  is no fixed footer. A handoff says what changed or needs attention — it
  doesn't restate this document.

Campaign handoff examples:

```
Current: CHECKPOINT REVIEW
Handoff → Agent 2: Review the portfolio-selection increment. Focus on
persistence across metric and sector changes and the selected-row
interaction on narrow phones.
```

```
CHECKPOINT APPROVED
Current: CHECKPOINT APPROVED
Handoff → Agent 1: This increment is sound. Continue automatically with
the next appropriate queued item.
```

```
READY TO MERGE
The entire campaign queue is complete and the integrated PR has passed
final review.
Current: READY TO MERGE
Next: User decides whether to merge.
```
