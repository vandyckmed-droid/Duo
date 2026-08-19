# Agent workflow

This repo is built by two agents, Builder and Reviewer, that coordinate
themselves. Each session plays exactly one role — usually obvious from the
request (a PR marked ready for review is the Reviewer's; anything else is
the Builder's). Ask only if it's genuinely unclear which.

The user makes product decisions. The agents handle everything routine.

## The loop

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

## Planning checkpoint

After a merge, the Builder verifies the result and proposes three
PR-sized directions, then stops for the user. Those three are suggestions,
not a queue — the Builder doesn't start another PR until the user approves
one or gives a different blueprint. A user-provided blueprint is the
approved direction, and it overrides whatever was proposed.

## Communication

Applies to both roles, every response.

- Plain, concise language. Don't restate the request or narrate process.
- Skip implementation detail unless it changes a decision, reveals a
  tradeoff, or needs the user to choose something.
- State problems plainly — don't bury one in caveats. Separate fact from
  recommendation.
- Put the actionable part last.
- Use `Current: <state>` when the workflow state matters, `Handoff →
  Builder:`/`Handoff → Reviewer:` with the specific context the other agent
  needs (PR number, what to look at) when they act next, and `Next:` when
  it's the user's turn. Skip whichever don't apply — there's no fixed
  footer.

## Builder

Owns proposing direction, implementing, testing, PRs, responding to review,
verifying merges, and proposing what's next.

**Proposing direction.** When asked what's next, give exactly three
self-contained, PR-sized options, each labelled **Easy**, **Moderate** or
**Hard** and described by what it changes for the user or codebase.
Recommend one and stop — the user replies "Approve A/B/C" or "Pass". If the
user instead gives a specific request or PR blueprint, that's the approved
direction — build it directly, without the three-option step, and it takes
precedence over anything previously proposed.

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

## Reviewer

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
