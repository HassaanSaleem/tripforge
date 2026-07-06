# OPERATOR DESK — what the loop is waiting on YOU for

One row per pending human gate. The loop adds a row whenever it halts for the
operator; the operator answers by saying the exact word(s) in **Say**. Cleared
rows are removed (history lives in the loop state and git log). Empty table =
nothing is asked of you.

Rules for the loop:
- Every halt-for-the-operator MUST be a row here — never buried in prose or a PR
  comment. A gate that is not on the desk was not asked.
- Each row includes one short context paragraph directly below the table row it
  belongs to: what happened, the recommendation, and what stays blocked.
- Never edit or reinterpret an existing row's **Say** word; add a new row instead.

| ID | Say | Question | Recommendation | Since | Blocks |
|----|-----|----------|----------------|-------|--------|
| PRM-SEAL-2 | `review pr 2` | PR #2 changes a sealed loop gate (`OPERATOR-DESK.md`); the loop may not merge it. | Review the change by hand; land it yourself if intended, or close the PR. The loop will not auto-merge sealed-gate edits. | 2026-07-06 | PR #2 merge |
| REG-L3-STACK | `wire l3 stack` | The regress phase runs the L3 smoke oracle (`node tests/integration/smoke.mjs`) but nothing boots the live stack it requires, so in regress it crashes on connect (ECONNREFUSED) and L3 coverage is a no-op. How should live-stack boot be wired into the regression gate? | Either boot+teardown the stack around the smoke gate in regress (reusing `verification.live.boot_command`/`teardown_command`), or explicitly scope L3 to the execute-phase Live Test & Fix gate and record it NOT-RUN in regress. This changes the regression-oracle/gate definition (sealed) → your call. | 2026-07-06 | L3 coverage in the regression gate |

<!-- Resolved 2026-07-05 (operator ratified both at iteration-1 kickoff):
     D-002 `scope pushes` — DIRECTIVE item 2 push rule scoped to halt only on
       pushes to main outside the gated pr-manager merge pipeline, pushes to new
       remotes, force-pushes, and deploys; feature-branch pushes authorized.
       Direct state-sync pushes to main remain gated off (repo.allow_state_sync_push
       stays false — those are pushes to main outside the merge pipeline).
     D-003 `align seals` — DIRECTIVE sealed-gate list now names the pr-manager
       review stages (scripts/pr-manager/prompts/) and system-architecture.md,
       matching CLAUDE.md. -->

<!-- Resolved 2026-07-05 (seed-0001 landing):
     D-005 `land seed-0001` — operator merged PR #1 (seed-0001 skeleton) by hand
       as squash commit 0a1b1dc; the pr-manager sealed-path guard correctly blocked
       the loop from self-merging its own regulator artifacts (first UAT card + this
       desk). seed-0001 marked done in backlog.json.
     D-004 `wire skeleton gates` — after the merge and CI green on 0a1b1dc, wired
       kitchenloop.yaml: oracle.smoke_command=`node tests/integration/smoke.mjs`,
       live.boot_command=`docker compose down -v && docker compose up --build --wait`,
       live.e2e_command=`npx playwright test`, pr_manager.require_ci=true. INV-027
       live verification is now out of the pre-skeleton carve-out. -->


**PRM-SEAL-2 context:** The mechanical sealed-path guard matched `OPERATOR-DESK.md` in PR #2's diff. Sealed-gate changes are operator gates, never loop commits, so the PR is marked NOT_MERGEABLE and set aside.

**REG-L3-STACK context:** In iteration 1's regress the L3 smoke gate crashed on connect — no server listening at `http://localhost:3000` and the Docker daemon was unavailable, so the compose stack could not be booted from within the phase. `verification.oracle.smoke_command` was wired by D-004, but the boot/teardown of the live stack lives in `verification.live` and is only invoked by the execute-phase Live Test & Fix gate (which tears the stack down afterward). Consequently the regress phase invokes the smoke oracle against a stack that is never up, so L3 is effectively unexercised in regress — the exact "unit tests pass but the app is broken" blind spot the gate exists to close. This iteration was **not** halted: the gate could not be evaluated (a warning-class condition, like a missing L3 test), it did not run-and-fail a product assertion, and all exercisable gates (lint + 17/17 L1/L2) are green. The fix — booting the live stack inside regress vs. scoping L3 to execute-only — is a change to the regression-oracle/gate definition, which is sealed, so it is your decision rather than a loop edit. Until resolved, regress reports L3 as NOT-RUN and the loop cannot detect an app-level break between execute cycles.
