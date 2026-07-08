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
| CI-IMG-BUILD | `add ci image build` | Should CI build the compose image so hermetic-build breaks gate merges? | Yes — add a docker-build job to `.github/workflows/ci.yml` | 2026-07-07 | Nothing today (gap: BUG-1-class breaks stay invisible to `ci_pass`) |
| ENV-PNPM-DENY | `pnpm perms fixed` | Why did the loop harness deny ALL `pnpm` commands in the iter-2 ideate session despite the `.claude/settings.json` allowlist? | Verify/repair the harness permission wiring so allowlisted `pnpm install`/`pnpm test`/`pnpm run lint` run inside loop sessions | 2026-07-07 | In-session L1/L2 + lint verification during ideate/execute (regress runs in its own runtime and is unaffected) |
| UAT-PR14 | `waive uat pr14` | Waive the UAT-card gate for PR #14 (spec-gap-0001: docs-only sync of data-model.md to resolved D-006)? | Yes — waive: markdown-only spec amendment, no product behavior, no browser journey applies; every other merge gate is green | 2026-07-09 | Merging PR #14 (spec-gap-0001 stays open) |

**CI-IMG-BUILD** — Iteration-2 ideate found the compose image was never hermetic
(report [BUG-1]/[IMP-4]: empty `.dockerignore` let host `node_modules` leak into
`COPY . .`, masking a broken build; every fresh clone failed `docker compose up
--build`). The product fix is ticketed (seed-0010, fix already verified in the
iter-2 worktree), but CI never builds the image (`lint`/`test`/`depcruise` only),
so this entire break class is invisible to the `ci_pass` merge gate. CI is a merge
gate, so adding an image-build job (full `docker build`, or at least
`docker build --target build`) is an operator change, not a loop commit — the loop
will not touch `.github/workflows/ci.yml` for this without this row being answered.
Nothing is blocked today; the gap just persists until wired.

**ENV-PNPM-DENY** — During the iteration-2 ideate session the runtime denied every
`pnpm` invocation (`pnpm install`, `pnpm install --frozen-lockfile`, `pnpm test`)
even though `.claude/settings.json` explicitly allowlists them; the prior ideate
run executed `pnpm install` fine, so the permission wiring regressed between runs
(report: Friction Points). Consequence: L1/L2 vitest and eslint could not be run
inside that session — the loop fell back to regress-phase coverage. This is
loop-infrastructure, not product; only the operator can inspect/repair the harness
permission config. Until then, in-session verification during ideate/execute may
silently degrade to live-stack-only evidence.
Evidence update (iteration-2 execute re-run, 2026-07-07): reproduced in the execute
session too, and the scope is wider than pnpm — `npm install` and even `rm` were
denied. The execute phase worked around it by running `pnpm test`/`pnpm run lint`
INSIDE the built Docker image (deterministic, same lockfile) and running the
Playwright e2e suite via a git-ignored `node_modules` shim over the npx-cached
`playwright` package (1.62.0-alpha; lockfile pins 1.61.1) with a CDN-downloaded
chromium-headless-shell. Workarounds are evidence-grade but slow and versioned
off-lockfile — the harness wiring still needs the operator fix. The shim was left
in place in the iter-2 worktree (`rm` denied); safe to delete or overwrite.

**UAT-PR14** — The pr-manager prep pipeline for PR #14 (`docs(spec-002): sync
data-model.md to resolved D-006`, ticket spec-gap-0001) passed every gate except
the UAT card, which fails closed: no `UAT Gate Results` comment exists on the PR
(docs-only change — no browser journey was run) and no per-PR waiver row was on
the desk. Green witnesses: pr-auditor APPROVE (doc verified line-for-line against
D-006 and packages/itinerary-schema/src/); codex Stage-4a APPROVE after one fixed
VIOLATION (the ListedItinerarySchema snippet contradicted itinerary.ts — corrected
in fed673b, pushed to the PR branch, codex re-review clean); codex final
merge-safety APPROVE; CI lint-and-test green on head fed673b1ba; zero file
deletions; no `uat-failed` label. Precedent: UAT-PR4/UAT-PR5 waivers for non-UI
PRs. Recommendation: waive (same class as UAT-PR4 — nothing for a browser journey
to exercise). Blocked until answered: merging PR #14; spec-gap-0001 remains open.
A follow-up ticket spec-gap-0003 was filed for the stale pre-D-006 open-decision
language remaining in sibling spec.md/plan.md (non-blocking, pr-auditor finding).

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
