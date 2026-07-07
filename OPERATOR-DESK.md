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
| REG-L3-STACK | `wire l3 stack` | The regress phase runs the L3 smoke oracle (`node tests/integration/smoke.mjs`) but nothing boots the live stack it requires, so in regress it crashes on connect (ECONNREFUSED) and L3 coverage is a no-op. How should live-stack boot be wired into the regression gate? | Either boot+teardown the stack around the smoke gate in regress (reusing `verification.live.boot_command`/`teardown_command`), or explicitly scope L3 to the execute-phase Live Test & Fix gate and record it NOT-RUN in regress. This changes the regression-oracle/gate definition (sealed) → your call. | 2026-07-06 | L3 coverage in the regression gate |
| REG-L3-MSG | `soften l3 msg` | May the loop wrap the "app unreachable" failure in the sealed L3 oracle `tests/integration/smoke.mjs` so it prints a clean `FAIL: app not reachable at ${BASE_URL}` instead of a raw `L3 smoke crashed: TypeError: fetch failed` stack dump? Behavior is unchanged (still exits non-zero); only the message wording changes. `smoke.mjs` is the wired L3 oracle (sealed), so the loop may not edit it without your say. | Approve — it's a cosmetic clarity fix, no gate-behavior change. Cheapest to fold into whatever REG-L3-STACK resolves (both touch the L3 smoke path), so the operator can batch them into one edit. | 2026-07-06 | nothing (cosmetic; a crashy message today reads as a loop bug, not a gate verdict) |

**REG-L3-STACK context:** In iteration 1's regress the L3 smoke gate crashed on connect — no server listening at `http://localhost:3000` and the Docker daemon was unavailable, so the compose stack could not be booted from within the phase. `verification.oracle.smoke_command` was wired by D-004, but the boot/teardown of the live stack lives in `verification.live` and is only invoked by the execute-phase Live Test & Fix gate (which tears the stack down afterward). Consequently the regress phase invokes the smoke oracle against a stack that is never up, so L3 is effectively unexercised in regress — the exact "unit tests pass but the app is broken" blind spot the gate exists to close. This iteration was **not** halted: the gate could not be evaluated (a warning-class condition, like a missing L3 test), it did not run-and-fail a product assertion, and all exercisable gates (lint + 17/17 L1/L2) are green. The fix — booting the live stack inside regress vs. scoping L3 to execute-only — is a change to the regression-oracle/gate definition, which is sealed, so it is your decision rather than a loop edit. Until resolved, regress reports L3 as NOT-RUN and the loop cannot detect an app-level break between execute cycles.

**REG-L3-STACK — iteration-2 update (environmental feasibility, from report [IMP-1]):** Iteration 2 confirmed the blocker is deeper than *wiring*. The Docker daemon was UP this time, but `docker compose up --build --wait` **failed pulling base images** (`cannot allocate memory` / no HTTPS proxy while pulling `postgres:17-alpine`) — the host had ~114 MB free and **no base images cached**. The lighter fallbacks were also unavailable: no local Postgres (`psql`/`pg_ctl`/Postgres.app all absent), and `next dev`/`pnpm exec next dev` is **permission-gated in autonomous mode** (no operator online to grant it). So even a perfectly-wired regress boot would still fail in this runtime. Please fold environmental feasibility into the REG-L3-STACK decision, not just wiring: e.g. **pre-pull & cache** `postgres:17-alpine` + `axllent/mailpit` and build the web image once so `--wait` never hits the registry; and/or **raise the Docker VM memory** allocation; and/or define a **host-run L3 fallback** (`next start` + an embedded/ephemeral Postgres) for when the compose image can't build. This is filed under REG-L3-STACK (not a new row) because that ask already owns the L3-boot question — this iteration just proved the answer must include *how the stack can physically boot in the loop runtime*.

**REG-L3-MSG context:** From report [IMP-2]. When nothing is listening, the sealed L3 oracle `tests/integration/smoke.mjs` prints a raw `L3 smoke crashed: TypeError: fetch failed` stack dump. It still exits non-zero (correct — it is not a silent no-op), but the wording reads like the oracle itself crashed rather than like a gate verdict ("app not reachable"). A one-line wrap (`FAIL: app not reachable at ${BASE_URL}`) would make the failure legible without changing behavior. Because `smoke.mjs` is the wired L3 regression oracle — a sealed-regulator file the loop may not edit — this cosmetic change is your call. Recommendation: approve and batch with REG-L3-STACK, since resolving REG-L3-STACK may relocate/rewrite the L3 path anyway (in which case this becomes moot). Nothing is blocked on it.

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

<!-- Resolved 2026-07-06 (seed-0002 schema decision + design landed on main):
     D-006 `land schema v0` — operator authorized the seed-0002 canonical-itinerary-
       schema landing. DECISIONS the execute phase MUST implement exactly:
       (a) SCHEMA_VERSION = "0.1.0";
       (b) THREE item kinds only — stay | activity | transfer. carRental is DEFERRED
           to a later operator-gated bump and is NOT in v0 (resolve the spec's
           [OPEN: D-006.b] markers as "3 kinds, no carRental"; supplyRef.port =
           [hotel, activity, transfer]);
       (c) media `source` enum = {licensed-stock, official-embed, agent-upload,
           traveler-ugc} (closed set; no scraped/AI-fabricated-as-real member).
       Implement via /speckit-implement against
       specs/002-canonical-itinerary-schema/tasks.md. Repo is pnpm — use pnpm.
     PRM-SEAL-2 `review pr 2` — operator authorized landing PR #2 (seed-0002 design +
       its desk edit) by merging the branch into main; the sealed-path guard correctly
       blocked the loop from self-merging its own desk edit, so the operator landed it
       by hand (per "do all"). Also landed: control-plane fix — loop oracle npm→pnpm +
       crash-notify (commit 0474a01), since the repo is a pnpm workspace. -->

<!-- Resolved 2026-07-06 (seed-0002 + seed-0007 landed via operator waiver):
     UAT-PR4 `waive uat pr4` — operator waived UAT for PR #4 (seed-0002 canonical
       itinerary schema v0). UAT was ENVIRONMENT_BLOCKED, not a defect: itinerary-
       schema is a pure-validation leaf library (no server/route/UI => no browser
       journey). Deterministic witness green (CI lint-and-test, pr-auditor APPROVE,
       exact D-006 compliance). Merged squash 1a2ab53 (#4); seed-0002 marked done.
     UAT-PR5 `waive uat pr5` — operator waived UAT for PR #5 (seed-0007 trust-
       boundary tests). Test-only (3 test files, no product source). Deterministic
       witness green (22 vitest incl. 5 new RBAC tests, eslint, pr-auditor APPROVE,
       codex clean, zero deletions). Merged squash 05f182d (#5); seed-0007 done.
     The UAT env-build fix (b9c6a19, option A) now installs deps in the evaluator
       worktree so future non-UI PRs reach a real verdict, not ENVIRONMENT_BLOCKED. -->
