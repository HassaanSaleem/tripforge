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
| D-006 | `land schema v0` | Authorize the seed-0002 canonical-itinerary-schema landing — the shape expansion + `SCHEMA_VERSION` bump (ALWAYS-HALT per DIRECTIVE item 2 / Constitution IV). Design is done and up for review in the seed-0002 PR. | **Authorize.** Confirm: (a) version `"0.1.0"` (recommended) vs `"1.0.0"`; (b) include `carRental` as a 4th item kind now (recommended — supply ports book it) vs later; (c) media `source` enum `{licensed-stock, official-embed, agent-upload, traveler-ugc}`. Then a future execute iteration runs `/speckit-implement` against the sealed spec. | 2026-07-06 | seed-0002 schema code; seed-0005 (budget allocator) & seed-0006 (marketplace) which import the v0 types |

**D-006 context.** Execute iteration 1 reached seed-0002 (Canonical itinerary schema v0). Expanding the `itinerary-schema` stub to the full entity graph (Itinerary → Day → Item[stay/activity/transfer] → MediaRef + PricingBlock + Provenance) and bumping `SCHEMA_VERSION` off `"0.0.0"` is a canonical-itinerary-schema **version bump/migration** — ALWAYS-HALT (DIRECTIVE item 2; Constitution Principle IV + Development Workflow "review by the project owner before merge"; the stub's own comment "A version BUMP … never done autonomously by the loop"). Per "feature plans propose, only operator gates land," the loop produced the **design only** — `specs/002-canonical-itinerary-schema/{spec,plan,data-model,tasks,quickstart}.md`, with the required versioned migration note (From `"0.0.0"` → To `"0.1.0"`) and a passing Constitution Check in `plan.md`. **No schema code was written.** The seed-0002 PR ships these artifacts for your review; `packages/itinerary-schema` is untouched. **Recommendation:** review the migration note + data-model, then say `land schema v0` (folding in the three open decisions above); a subsequent execute iteration implements it via `/speckit-implement`. **Blocked until answered:** seed-0002's schema code, and downstream seed-0005/seed-0006 (they import the v0 types). seed-0002 stays in `todo` (design done, implementation gated).

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

