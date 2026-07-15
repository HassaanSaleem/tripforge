# Loop State — tripforge

## Current Status

**Iteration**: 6
**Mode**: strategy
**Status**: CONTINUE (all gates green — lint, L1/L2+L3 vitest 573/573, L3 smoke 46/46 against the live built stack)
**Last Updated**: 2026-07-15 03:26 PKT

## Blocked Combos

<!-- Blocked combos have moved to a structured YAML file for machine readability.
     See .kitchenloop/blocked-combos.yaml (or paths.blocked_combos in config).
     This section is kept for backward compatibility — the orchestrator reads
     from the YAML file first, falling back to this section if YAML is absent. -->

(see .kitchenloop/blocked-combos.yaml)

## Iteration History

<!-- Each iteration appends a summary line here.
     Format: | N | date | mode | phases | outcome | notes | -->

| Iter | Date | Mode | Phases | Outcome | Notes |
|------|------|------|--------|---------|-------|
| 1 | 2026-07-06 | strategy | regress | CONTINUE | Lint PASS; L1/L2 17/17 (100%); L3 smoke NOT-RUN (no live stack, docker down) → desk REG-L3-STACK; quality sweep skipped (not 3rd iter) |
| 2 | 2026-07-07 | strategy | ideate→triage→execute→regress | CONTINUE | Lint PASS; L1/L2 51/51 (100%); L3 smoke 5/5 vs live compose stack (first exercisable run — REG-L3-STACK Option 2); PRs #6 (seed-0010 hermetic Docker build) and #7 (seed-0011/0012 INV-020 /view title fix + title-negative e2e) merged; seed-0013 (favicon) in_review; coverage 3/36; quality sweep skipped (not 3rd iter) |
| 3 | 2026-07-11 | strategy | 6x(ideate→triage)→many execute cycles→regress→quality-sweep | CONTINUE | Lint PASS; L1/L2 326/326 (100%, 42 env-gated L3 skipped without DB) — same suite 368/368 (100%) against the live Postgres network; L3 smoke 41/41 vs live compose stack; PRs #10–#40 merged/landed (supply-adapter, L3 harness, budget allocator + AI planner + booking money path, marketplace trade layer v0, premium UI, workspace itinerary list, booked-price fidelity, seller earnings surface); coverage 30/36 (83.3%, pending commit); quality sweep ran — 1 new ticket filed (2 knip-flagged unexported types), deduped against 10 pre-existing open QS3-series tickets from an earlier squash-merged sweep lineage; depcruise clean, no TODO/stub debt, specs 012-014 (28 FRs) fully implemented+tested |
| 4 | 2026-07-12 | strategy | ideate→execute cycles→regress | CONTINUE | Lint PASS; L1/L2+L3 vitest 392/392 (100%, DB-inclusive run, 39 files); L3 smoke 41/41 vs live compose stack; PRs #42 (seed-0022 content-library v0) and #44 (marketplace-copy/picker/typed-errors/demo-plan polish bundle) merged; PR #46 (coverage-matrix derivation tool, scenario hardening, markup prefill, auth-form dedup bundle) open/in-review; coverage 17/36 (47.2%) per `coverage-matrix.yaml` on disk — this iteration's ideate scenario (reseller-builds-fresh, itinerary-builder × web/api × agent-reseller) not yet reflected in the matrix, a known drift tracked by seed-0031 (fix pending in PR #46); quality sweep skipped (iter 4 not a multiple of 3) |
| 5 | 2026-07-14 | strategy | many execute cycles (quality-sweep drain + Friday demo-drive UI bundle)→regress | CONTINUE | Lint PASS; L1/L2+L3 vitest 483/483 (100%, DB-inclusive run, 48 files, up from 392); L3 smoke 46/46 vs live compose stack; PRs #46–#57 and #59 merged (seed-0031 coverage-derivation tool landed; seed-0014 SSE streaming closed INV-028; three quality-sweep drain bundles #48–#50, #52–#53 reaching the operator's 🎯 90% backlog-ratio goal at #53; Friday demo-drive UI bundle: dashboard shell #56, planner UX redesign #57, auth/trust-badge restyle #55, multi-option AI itinerary #59); PR #60 (conversational AI itinerary editing, demo-03-chat-builder) in_review, not yet merged; demo-01-seed deferred (heavy seed-script cycle killed at 55m); coverage 28/36 (77.8%) per regenerated `coverage-matrix.yaml` — zero drift against `derive-coverage.mjs` (working tree clean after regen), confirming the seed-0031 fix now holds for a 2nd iteration; quality sweep skipped (iter 5 not a multiple of 3) |
| 6 | 2026-07-15 | strategy | ideate (fresh-draft-client-view)→triage→14 execute cycles→regress | CONTINUE | Lint PASS; L1/L2+L3 vitest 573/573 (100%, DB-inclusive run, 56 files, up from 483); L3 smoke 46/46 vs live compose stack; PRs #60–#73 merged (demo-03-chat-builder conversational editing, demo-11-group-travel departures, e2e-planner-journey stale-test fix, repo-wide typecheck fix, demo-09-request-agent fork, demo-08-discover feed, demo-01-seed demo data population reaching 10/11 demo tickets, demo-polish seed+booking bundle, seed-0018 provenance badges, seed-0027 booked-state/markup surfacing, seed-0009 agency member roster, demo-10-flights closing DEMO 11/11 feature-complete, seed-0022a real device media upload, and #73's same-day media-serving-route + upload magic-byte security hardening follow-up); coverage 30/36 (83.3%) per regenerated `coverage-matrix.yaml`, up from 28/36 — new combos itinerary-builder×{api,web}×client (fresh-draft-client-view scenario) and content-library×web×agent-seller (seed-0022a); `derive-coverage.mjs` hard-crashed mid-iteration on an out-of-vocabulary `KITCHENLOOP-COVERAGE` block PR #61 shipped (`group-travel`/`agent` not in `kitchenloop.yaml`'s dimension vocabulary) — block removed to unblock tooling, desk row GROUP-TRAVEL-DIMENSION opened for the operator's 7th-dimension decision; quality sweep ran (3rd-iteration cadence) — see Quality Sweep section below |

## Regression — Iteration 6

- **Date**: 2026-07-15 03:26 PKT
- **Branch**: kitchen/iter-6 (iteration-6 worktree tip, carries merged PRs #60–#73)
- **Lint**: PASS (`eslint .` inside the build-stage verify image, no findings, exit 0) — `.kitchenloop/logs/regress-iter-6-lint.log`
- **Typecheck** (investigative, not part of the oracle): FAIL — `pnpm run typecheck` exits 2 (`.kitchenloop/logs/regress-iter-6-typecheck.log`); see Warnings
- **Pass rate**: 100% (573/573, DB-inclusive run, fresh compose boot) — `.kitchenloop/logs/regress-iter-6-l3vitest.log`
- **Previous pass rate**: 100% (483/483)
- **Delta**: ±0%
- **Skip rate**: 0% (0 skipped) in the DB-inclusive run; 16.6% (95/573) in the plain L1/L2 run (env-gated `l3-*.test.ts` specs skip cleanly without `DATABASE_URL`, not silent test loss) — `.kitchenloop/logs/regress-iter-6.log`
- **Test count**: 573 (previous: 483) — 56 test files (up from 48)
- **Duration**: 3.00s (vitest run, DB-inclusive, `--network tripforge_default -e DATABASE_URL=...`)
- **L3 smoke (`node tests/integration/smoke.mjs`)**: PASS 46/46 — health/auth/PMF-view/build→book/client-view checks all green against a freshly booted compose stack (postgres/mailpit/web Healthy, migrate exited 0) — `.kitchenloop/logs/regress-iter-6-smoke.log`
- **Consecutive failures**: 0
- **Status**: CONTINUE

### Failing Tests
None. (See Warnings — a real `pnpm run typecheck` break was found by investigation outside the standard oracle, ticketed, not a test-suite failure.)

### New Patterns
See `memory/codebase-patterns.md` — added a new confirmed Testing Pattern (shared test-flow helpers going stale silently on flow-shape changes, now confirmed 3 times: `tests/e2e/support.ts` across spec 018/019, plus this iteration's Node-script-side staleness), extended the "Green L1/L2 necessary never sufficient" note with iter 6 as a second consecutive clean live-scenario pass, and extended the vitest-suite-speed data point (573 tests → 1.55s/3.0s).

### Warnings
- **Six orphaned `rescue/iter-6-*` regress attempts found** (`89115fa`, `76a15ab`, `cfa605a`, `b530a0d`, `ac88496`, `56d1b41`) — the `REGRESS-ARTIFACT-LOSS` class recurring six times in this one iteration rather than once. The product source tree (`apps`/`packages`/`scripts`) on the most complete orphaned attempt (`56d1b41`) was byte-identical to this run's HEAD, so its draft findings (a completed quality sweep + a typecheck-break ticket) were independently re-verified rather than either discarded or blindly trusted — see the Quality Sweep section and `docs/internal/reports/quality-sweep-iter-6.md`'s Provenance note for the full re-verification. No product-code loss occurred; only loop-artifact commits were orphaned, consistent with the known REGRESS-ARTIFACT-LOSS mechanics (already on `OPERATOR-DESK.md`).
- **New regression-oracle blind spot found and ticketed**: `pnpm run typecheck` (`tsc --noEmit` via turbo, in-image) currently fails repo-wide on `l3-agency-admin.test.ts` (4x TS2345) and `l3-booking.test.ts` (2x TS18048) — the same bug class PR #63 fixed elsewhere hours earlier. Neither `pnpm test` (vitest) nor `pnpm run lint` (eslint) catch it, so it was invisible to every gate the loop currently runs. This is NOT a stop-condition trip (typecheck isn't part of `verification.oracle` in `kitchenloop.yaml`) — filed as bug ticket `typecheck-break-agency-admin-booking-l3` (medium) and desk row `TYPECHECK-GATE-GAP` (should typecheck join the oracle — a sealed-gate change, operator decision).
- Host `pnpm` remained denied in this loop session (consistent with iter 1–5 — desk row ENV-PNPM-DENY); lint + tests + typecheck ran inside the built image (`docker build -f apps/web/Dockerfile --target build` → `docker run --rm tripforge-verify pnpm test`/`pnpm run lint`/`pnpm run typecheck`), DB-inclusive test run added `--network tripforge_default -e DATABASE_URL=...` per the verified in-image recipe.
- Compose-log scan (fresh boot, `.kitchenloop/logs/regress-iter-6-compose.log`) found exactly one `ERROR`-level line: the same documented-benign concurrent-booking-race duplicate-key line seen every iteration (`l3-booking.test.ts`'s losing racer), not a product defect. No `deadlock detected` line this run.
- No new blocked combos (`.kitchenloop/blocked-combos.yaml` is empty).
- `derive-coverage.mjs`'s vocabulary guard hard-crashed mid-iteration on PR #61's out-of-vocabulary `KITCHENLOOP-COVERAGE` block (`"feature": "group-travel"`, `"user_type": "agent"`, neither in `kitchenloop.yaml`'s dimension vocabulary) — the block was removed by an earlier phase this iteration so the tool runs clean again (30/36); the underlying 7th-dimension question is desk row `GROUP-TRAVEL-DIMENSION`, ticket `17840666553970558336`. This run's Step 3.5 regeneration exited 0 with no warnings.
- Quality sweep ran (3rd-iteration cadence, oracle green) — see `docs/internal/reports/quality-sweep-iter-6.md`: 6 tickets filed (5 duplication-cleanup `improvement`, 1 `bug` for the typecheck blind spot above), depcruise clean (0 violations), knip's 8 unused-exported-types class not re-ticketed (each is feature-load-bearing, none crosses the extraction threshold), zero TODO/stub debt, spec↔code completeness clean (specs 015-027).
- Backlog now 98 total, 89 done, 9 open (90.8% done) — up from 92/3-open last iteration; net +7 open tickets this pass (6 quality-sweep findings + 0 net change to the pre-existing 3, since one of those 3 — `demo-polish-discover-layout` — stays open per `DISCOVER-LAYOUT-REPRO`'s own recommendation).
- `.kitchenloop/backlog.json` and `OPERATOR-DESK.md` reflect this regress run's own additions (6 new tickets, 1 new desk row) — landed directly by this phase since they are regress's own quality-sweep/investigation findings, not another phase's pending state.

### Coverage
30/36 combos tested (83.3%) per the regenerated `.kitchenloop/coverage-matrix.yaml` (`node scripts/kitchenloop/derive-coverage.mjs` — 30 unique combos from 38 declared entries across 11 sources), up from 28/36 (77.8%) last iteration. Two new combos this iteration: `itinerary-builder`×{`api`,`web`}×`client` (fresh-draft-client-view scenario, cross-checked against Postgres ground truth on both surfaces) and `content-library`×`web`×`agent-seller` (seed-0022a real device media upload, spec 027).

## Regression — Iteration 5

- **Date**: 2026-07-14 00:52 PKT
- **Branch**: kitchen/fix-demo-03-chat-builder-conversational-editing (iteration-5 worktree tip; carries merged PRs #46–#57/#59 plus in-flight PR #60)
- **Lint**: PASS (`eslint .` inside the build-stage verify image, no findings, exit 0) — `.kitchenloop/logs/regress-iter-5-lint.log`
- **Pass rate**: 100% (483/483, DB-inclusive run, fresh compose boot)
- **Previous pass rate**: 100% (392/392)
- **Delta**: ±0%
- **Skip rate**: 0% (0 skipped) in the DB-inclusive run; 14.9% (72/483) in the plain L1/L2 run (env-gated `l3-*.test.ts` specs skip cleanly without `DATABASE_URL`, not silent test loss) — `.kitchenloop/logs/regress-iter-5.log`
- **Test count**: 483 (previous: 392) — 48 test files (up from 39); growth driven by the quality-sweep drain bundles (#48–#53) and the demo UI bundles (#55–#57, #59)
- **Duration**: 2.90s (vitest run, DB-inclusive, `--network tripforge_default -e DATABASE_URL=...`) — `.kitchenloop/logs/regress-iter-5-l3vitest.log`
- **L3 smoke (`node tests/integration/smoke.mjs`)**: PASS 46/46 — health/auth/PMF-view/build→book/client-view checks all green against a freshly booted compose stack (postgres/mailpit/web Healthy, migrate exited 0) — `.kitchenloop/logs/regress-iter-5-smoke.log`
- **Consecutive failures**: 0
- **Status**: CONTINUE

### Failing Tests
None.

### New Patterns
See `memory/codebase-patterns.md` — updated the coverage-matrix-drift architecture pattern to record it as resolved (2nd consecutive iteration of zero drift, seed-0031's derivation tool confirmed durable). No other pattern met the 2+-iteration confirmation bar this iteration.

### Warnings
- Host `pnpm` remained denied in this loop session (consistent with iter 1–4 — desk row ENV-PNPM-DENY); lint + tests ran inside the built image (`docker build -f apps/web/Dockerfile --target build` → `docker run --rm tripforge-verify pnpm test`/`pnpm run lint`), DB-inclusive run added `--network tripforge_default -e DATABASE_URL=...` per the verified in-image recipe.
- Compose-log scan (fresh boot, `.kitchenloop/logs/regress-iter-5-compose.log`) found **zero** `ERROR`/`FATAL`/`Unhandled` lines — cleaner than iterations 3–4, which each logged the one documented-benign concurrent-booking-race duplicate-key line. That line comes from the in-image `docker run ... pnpm test` process's own stdout (`l3-booking.test.ts`'s losing racer), not from the compose `web`/`postgres` container logs, so its absence here is expected, not a regression.
- No new blocked combos (`.kitchenloop/blocked-combos.yaml` is empty).
- `.kitchenloop/backlog.json` reflects PR #60's ticket transitioned to `in_review` (per the latest commit, `90f0715`) — left as-is for the orchestrator's post-phase auto-commit convention; regress did not commit it.

### Coverage
28/36 combos tested (77.8%) per the regenerated `.kitchenloop/coverage-matrix.yaml` (`node scripts/kitchenloop/derive-coverage.mjs` — 28 unique combos from 35 declared entries across 10 sources). Working tree showed zero diff after regeneration, meaning the on-disk matrix already matched the scenario files' own declarations exactly — no hand-authored drift this iteration.

## Regression — Iteration 4

- **Date**: 2026-07-12 02:49 PKT
- **Branch**: kitchen/iter-4 (iteration worktree tip; carries merged PRs #42/#44 plus in-flight PR #46)
- **Lint**: PASS (`eslint .` inside the build-stage verify image, no findings, exit 0)
- **Pass rate**: 100% (392/392, DB-inclusive run)
- **Previous pass rate**: 100% (368/368)
- **Delta**: ±0%
- **Skip rate**: 0% (0 skipped)
- **Test count**: 392 (previous: 368) — 39 test files (up from 35); growth driven by seed-0022 (content-library v0) and the marketplace-polish bundle (#44)
- **Duration**: 2.67s (vitest run, DB-inclusive, `--network tripforge_default -e DATABASE_URL=...`)
- **L3 smoke (`node tests/integration/smoke.mjs`)**: PASS 41/41 — health/auth/PMF-view/build→book/client-view checks all green against the freshly booted compose stack (postgres/mailpit/web Healthy, migrate exited 0)
- **Consecutive failures**: 0
- **Status**: CONTINUE

### Failing Tests
None.

### New Patterns
See `memory/codebase-patterns.md` (reviewed this iteration — no new pattern met the 2+-iteration confirmation bar; existing patterns still hold).

### Warnings
- Host `pnpm` remained denied in this loop session (consistent with iter 1–3 — desk row ENV-PNPM-DENY); lint + tests ran inside the built image (`docker build -f apps/web/Dockerfile --target build` → `docker run --rm tripforge-verify pnpm test`/`pnpm run lint`), DB-inclusive run added `--network tripforge_default -e DATABASE_URL=...` per the verified in-image recipe.
- Compose-log scan found exactly one `ERROR`-level line: `duplicate key value violates unique constraint "booking_component_itinerary_item_idx"` — the same documented-benign concurrent-booking-race line seen every iteration (`l3-booking.test.ts`'s losing racer), not a product defect. No `deadlock detected` line this run.
- **Coverage-matrix drift (known, ticketed).** `.kitchenloop/coverage-matrix.yaml` on disk still shows 17/36 (47.2%) — the iteration-3 claim of 30/36 in this file's prior entry was itself never committed to the matrix (a recurrence of the matrix's self-documented artifact-loss pattern). This iteration's ideate scenario (`reseller-builds-fresh`) exercised itinerary-builder × {web, api} × agent-reseller live but that isn't reflected in the matrix either. Root-caused and ticketed this iteration as seed-0031 ("coverage matrix and loop-state.md silently disagree"); a fix (structured coverage-claim + derivation tool) is bundled in open PR #46, not yet merged. Regress reports the matrix's on-disk number as-is rather than reconciling it by hand, per the ticket's own recommendation to stop hand-authoring both sides.
- `.kitchenloop/backlog.json` carries uncommitted working-tree changes (three tickets — seed-0031, seed-0032, seed-0033 — moved to `in_review` under PR #46, plus new ticket seed-0034 filed `todo`) from earlier phases this iteration — left as-is for the orchestrator's post-phase auto-commit per prior-iteration convention; regress did not commit them.
- Untracked evidence files at the worktree root (`form-with-dates.png`, `workspace-form.png`) and `.kitchenloop/uat-cards/seed-0028.md` predate this regress run (execute/UAT phase artifacts) — left untouched; not a regress concern.
- No new blocked combos (`.kitchenloop/blocked-combos.yaml` is empty).

### Coverage
17/36 combos tested (47.2%) per `.kitchenloop/coverage-matrix.yaml` on disk — see the Coverage-matrix drift warning above for why this likely undercounts actual iteration-3/4 scenario coverage. No new combo entries were appended to the matrix file itself this iteration.

## Regression — Iteration 3

- **Date**: 2026-07-11 16:12 PKT
- **Branch**: kitchen/fix-seed-0030-seller-earnings (iteration worktree tip; carries seed-0030 impl + UAT card on top of the iteration-3 merge history)
- **Lint**: PASS (`eslint .` inside the build-stage verify image, no findings)
- **Pass rate**: 100% (368/368, DB-inclusive run); 100% (326/326, L1/L2-only run with 42 env-gated tests skipped)
- **Previous pass rate**: 100% (51/51)
- **Delta**: ±0%
- **Skip rate**: 0% (0 skipped) in the DB-inclusive run; 11.4% (42/368) in the plain L1/L2 run — the 42 are env-gated L3 vitest specs (`l3-*.test.ts`) that require `DATABASE_URL` and skip cleanly without it, not silent test loss
- **Test count**: 368 (previous: 51) — 35 test files; jump driven by iteration-3 feature work (booking, marketplace/revenue-share, client-view, content-library, supply-adapter contracts)
- **Duration**: 878ms (vitest run, no DB) / 2.61s (vitest run, DB-inclusive incl. `l3-booking.test.ts` deadlock-repro test)
- **L3 smoke (`node tests/integration/smoke.mjs`)**: PASS 41/41 — health/auth/PMF-view/build→book/client-view checks all green against the freshly booted compose stack (postgres/mailpit/web Healthy, migrate exited 0)
- **Consecutive failures**: 0
- **Status**: CONTINUE

### Failing Tests
None.

### New Patterns
See `memory/codebase-patterns.md` (updated this iteration).

### Warnings
- **Regression checkpoint deferred across a large span.** `loop-state.md` last saw a regress update at iteration 2 (2026-07-07); iteration 3 ran six ideate passes and ~15 execute cycles (PRs #10–#40) before this regress checkpoint, so this report covers the full accumulated span (`dc060cb..HEAD`, 71 commits) rather than one execute cycle. All gates are green at this checkpoint; no evidence of an undetected regression across the span (L1/L2 was kept green PR-by-PR per the pr-manager gate).
- Host `pnpm` remained denied in this loop session (consistent with iter 1/2 — desk row ENV-PNPM-DENY); lint + tests ran inside the built image (`docker build -f apps/web/Dockerfile --target build` → `docker run --rm tripforge-verify pnpm test`/`pnpm run lint`), and the DB-inclusive run added `--network tripforge_default -e DATABASE_URL=...` per the verified in-image recipe. Evidence: `.kitchenloop/logs/regress-iter-3.log`, `regress-iter-3-l3vitest.log`, `regress-iter-3-lint.log`, `regress-iter-3-smoke.log`, `regress-iter-3-compose.log`.
- Compose-log scan found exactly one `ERROR`-level line: `duplicate key value violates unique constraint "booking_component_itinerary_item_idx"` from `l3-booking.test.ts`'s concurrent-booking race assertion — this is the documented-benign line (the losing racer's expected 23505 before its typed `already_consumed` response), not a product defect. No `deadlock detected` line this run (that class is the real-bug signature per prior incident, seed-0015).
- `.kitchenloop/coverage-matrix.yaml` and `.kitchenloop/backlog.json` carry uncommitted working-tree changes (coverage backfill to 30/36 combos + tickets seed-0030/0031/0032, plus the quality sweep's own ticket) from earlier phases this iteration — left as-is for the orchestrator's post-phase auto-commit per prior-iteration convention; regress did not commit them.
- No new blocked combos (`.kitchenloop/blocked-combos.yaml` is empty).
- **seed-0030's Live Test & Fix (INV-027) and UAT gates are outstanding.** The quality sweep's spec-completeness check (specs 012-014) found seed-0030's own `tasks.md` T014-T016 unchecked — no `.kitchenloop/evidence/` entries exist yet, only the sealed UAT card file. Code+tests are complete and green (confirmed by this regress run), but the PR (#40) has not cleared the live-verification/UAT steps. This is an execute-phase / pr-manager gate to close, not a regress action — noted here so it isn't lost.
- **Backlog-aging signal (not gate-blocking):** 7 of the quality sweep's 10 pre-existing QS3-series tickets have now survived 3+ sweep/delta passes without being worked. Worth a look at drain prioritization, but not a stop condition.

### Coverage
30/36 combos tested (83.3%, per the working tree's pending `coverage-matrix.yaml`) — up from 3/36 (8.3%) at the iteration-2 checkpoint. Six ideate passes this iteration exercised: golden-path (itinerary-builder/booking/marketplace × web+api × agent-seller, T2), content-library frontier (×3 user_types × api/web, T3), reseller-books-copy-live (booking × agent-reseller/client, T2 — surfaced and same-iteration-fixed the booked-price fidelity bug), partially-booked-client-view (itinerary-builder × client, T2), revenue-share-seller-visibility (revenue-share × agent-seller/client, T3 — surfaced the seller-earnings-invisible gap, seed-0030, fixed same iteration), trust-demand-side-live (trust × agent-reseller/client, T2, closing out trust dimension 6/6). Remaining gap: 6/36 combos untested — itinerary-builder×web×agent-reseller, itinerary-builder×api×agent-reseller, content-library×web×agent-seller, content-library×web×agent-reseller, marketplace×web×client, marketplace×api×client.

## Regression — Iteration 2

- **Date**: 2026-07-07 17:15 PKT
- **Branch**: kitchen/iter-2
- **Lint**: PASS (`eslint .`, no findings)
- **Pass rate**: 100% (51/51)
- **Previous pass rate**: 100%
- **Delta**: ±0%
- **Skip rate**: 0% (0 skipped)
- **Test count**: 51 (previous: 17) — 8 test files (domain money 11; itinerary-schema migration 4, media 5, roundtrip 5, money 8, provenance 7; api agency-admin-rbac 5, rbac 6)
- **Duration**: 231ms (vitest run)
- **L3 smoke (`node tests/integration/smoke.mjs`)**: PASS 5/5 — first iteration the gate was exercisable. Per `regress_l3_boot: true` (REG-L3-STACK Option 2) the live stack was booted around the oracle (`docker compose up --build --wait`: postgres/mailpit/web Healthy, migrate exited 0), smoke run against http://localhost:3000, compose-log scan clean (no ERROR/FATAL/Unhandled), then `down -v` teardown.
- **Consecutive failures**: 0
- **Status**: CONTINUE

### Failing Tests
None.

### New Patterns
Consolidated to `memory/codebase-patterns.md`: (1) rendered-surface blind spots — body-text-only e2e assertions give false confidence on branding/metadata invariants (INV-020 class), confirmed iter 1 (seed-0007) + iter 2 (seed-0011/0012); (2) live-verification-first — the live browser/stack gates keep finding real violations all L1/L2 layers pass over, confirmed both iterations.

### Warnings
- None gate-blocking. Environment note: host `pnpm` remained denied in this loop session (desk row ENV-PNPM-DENY), so lint + L1/L2 ran inside the built image (`docker build --target build` → `docker run --rm tripforge-verify pnpm test`) — same evidence quality, witnessed in `.kitchenloop/logs/regress-iter-2.log`.
- Regression tested the worktree tree as-is, which carried the pr-manager's post-merge backlog state update and the seed-0010 Dockerfile/.dockerignore changes already squash-merged to main (PR #6, bb896ba) — tested tree matches shipped state.
- Coverage matrix records trust×web×client as "fail" (BUG-2/INV-020) from ideate time; the fix landed the same iteration via PR #7. The cell reflects when it was tested — the next ideate pass on that combo should re-record it.

### Coverage
3/36 combos tested (8.3%); all 3 newly exercised this iteration: trust×api×agent-seller (pass, T1), trust×web×agent-seller (pass, T1), trust×web×client (fail at ideate time — BUG-2, fixed in-iteration).

## Regression — Iteration 1

- **Date**: 2026-07-06 13:07 PKT
- **Branch**: kitchen/fix-seed-0002-canonical-itinerary-schema
- **Lint**: PASS (`eslint .`, exit 0, no findings)
- **Pass rate**: 100% (17/17)
- **Previous pass rate**: — (first tracked regress)
- **Delta**: —
- **Skip rate**: 0% (0 skipped)
- **Test count**: 17 (previous: —)
  - `packages/domain/src/__tests__/money.test.ts` — 11 tests
  - `packages/api/src/__tests__/rbac.test.ts` — 6 tests
- **Duration**: 0.34s (vitest run)
- **L3 smoke (`node tests/integration/smoke.mjs`)**: NOT-RUN — crashed on connect (ECONNREFUSED); no live stack at http://localhost:3000 and the Docker daemon was unavailable, so the compose stack could not be booted from within the regress phase. This is a warning-class "gate not exercisable" condition, NOT a run-and-fail product assertion. HALT was deliberately NOT tripped.
- **Consecutive failures**: 0
- **Status**: CONTINUE

### Failing Tests
None.

### New Patterns
None consolidated — iteration 1 is the first tracked iteration; patterns require confirmation across 2+ iterations (memory/codebase-patterns.md left unchanged).

### Warnings
- **L3 smoke gate not exercisable in regress.** The regress phase invokes the smoke oracle but nothing boots the live stack it needs (boot/teardown lives in the execute-phase Live Test & Fix gate). Filed as OPERATOR-DESK row **REG-L3-STACK** (sealed regression-oracle wiring → operator decision). Until resolved, the loop cannot detect an app-level break between execute cycles.

### Coverage
0/36 combos tested (0.0%); no new combos exercised this iteration.
