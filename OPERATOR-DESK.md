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
_Empty — nothing is asked of the operator._

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

<!-- Resolved 2026-07-06 (REG-L3-STACK Option 2 + REG-L3-MSG, operator-authorized):
     REG-L3-STACK `wire l3 stack` — operator chose Option 2 (real L3 in regress).
       regress-gate now boots verification.live.boot_command around the L3 smoke and
       tears down; a boot that can't come up is L3 NOT-RUN (warning), never a HALT
       (commit 5d2246a). Fixed the two bugs that kept the stack from going healthy so
       `docker compose --wait` now exits 0: Next.js bound to $HOSTNAME (-> HOSTNAME=0.0.0.0)
       and the IPv6 `localhost` healthcheck (-> 127.0.0.1) + start_period (commit eab3ec7).
       Verified: web healthy ~10s, --wait exits 0, L3 smoke 5/5 green. Also unblocks the
       execute-phase INV-027 live gate (same --wait path).
     REG-L3-MSG `soften l3 msg` — smoke.mjs prints `FAIL: app not reachable at <url>`
       instead of a raw fetch stack dump on connection failure (commit 5d2246a). -->
