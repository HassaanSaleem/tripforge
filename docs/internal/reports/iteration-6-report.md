# Kitchen Loop Report - Iteration 6

## Scenario: fresh-draft-client-view
**Date**: 2026-07-15
**Mode**: strategy
**Tier**: T1 Foundation
**Features Exercised**: itinerary-builder (client-facing view of a freshly AI-drafted, wholly UN-booked itinerary, cross-checked against Postgres ground truth on both the api and web platforms)

## What I Did (as a user)

1. Read `docs/internal/loop-state.md` and `.kitchenloop/coverage-matrix.yaml` to find the biggest coverage gap. Of 36 feature x platform x user_type combos, 8 were untested (28/36, 77.8%) — 6 of the 8 involved the `client` user_type, and `itinerary-builder x {api,web} x client` was untested on BOTH platforms simultaneously (every prior client-view scenario approached from the booking/revenue-share/trust angle on partially- or fully-booked trips; none had `itinerary-builder` as its declared feature). Tier balance also favored T1: across every scenario's own declared tier, only ~9% of entries were T1 against the 30% target, so I picked T1 Foundation.
2. Ran the Codex feasibility check before writing anything. It correctly REDIRECTed: the happy-path "client views a fresh unbooked draft" behavior is already thoroughly tested by `packages/api/src/__tests__/l3-client-view.test.ts` (US1, payload-vs-Postgres-row value scan) and `tests/e2e/client-view-journey.spec.ts` (rendered-page assertions) — it just was never *declared* in the coverage matrix because `derive-coverage.mjs` only scans `scenarios/incubating/*/scenario.mjs` and `tests/e2e/*.spec.ts`, never `packages/**/__tests__/*.test.ts`. Codex's suggested narrower, genuinely new angle: no existing test cross-references Postgres ground truth against BOTH the API payload and the rendered HTML in the SAME run. I adjusted the scenario to do exactly that.
3. Studied `scenarios/incubating/partially-booked-client-view/scenario.mjs` for the established L3-scenario conventions (cookie-jar helpers, `trpcMutate`/`trpcSubscribe`/`trpcQuery`, `psql` state-delta helper) and reused them directly rather than reinventing.
4. Wrote `scenarios/incubating/fresh-draft-client-view/scenario.mjs`: an agent-seller signs up, drafts a Vienna trip, mints a share link, and books NOTHING. The scenario then reads the itinerary's `document` jsonb column DIRECTLY from Postgres (bypassing the app layer entirely — a genuinely independent ground truth) and cross-checks it against (a) the anonymous `clientView.itinerary` tRPC payload and (b) the rendered `/view/{token}` SSR HTML, on per-item price, total, day/title content, and a full confidential key+value leak scan on both surfaces.
5. First run failed at "AI draft persists an itinerary" — `workspace.itinerary.draft` no longer directly persists. Spec 019 (compare-then-choose, already flagged as a known staleness risk in my memory) changed the flow: `draft` now returns 1-3 unpersisted `DraftOption`s, and a separate `selectDraft` subscription (input: `{tripRequest, variant}`) actually persists the chosen one. Fixed by adding the `draft` → pick `balanced` variant → `selectDraft` two-step exactly like the current UI does.
6. Second run failed one check: `/Day 1/.test(rendered)` — React SSR splits adjacent text/expression nodes with an `<!-- -->` hydration-boundary comment (`Day <!-- -->1`), so a naive substring/regex check false-negatives on the raw HTML even though the page renders correctly. Fixed by stripping HTML comments before the text-content regex checks (documented inline as a real "rendered-surface blind spot" gotcha, the same class of issue as the INV-020 pattern already in `memory/codebase-patterns.md`, just in the opposite direction — here it broke a passing feature's TEST, not the feature itself).
7. Third run: all 66 checks passed. Ran it a second time from scratch to confirm it isn't flaky (both runs clean).
8. Declared the `KITCHENLOOP-COVERAGE` block (`itinerary-builder x api x client`, `itinerary-builder x web x client`, both T1, iteration 6) and ran `node scripts/kitchenloop/derive-coverage.mjs`. It hard-crashed — see Bugs Found BUG-1 below. Fixed that first, then re-ran: 30/36 combos (83.3%), up from 28/36, zero other drift.
9. Ran the full verification recipe: `docker build -f apps/web/Dockerfile --target build` → `pnpm run lint` (clean) → `pnpm test` DB-inclusive (573/573, up from 483/483 pre-iteration — my scenario doesn't add vitest tests, so this count reflects other work already in the tree/image) → `node tests/integration/smoke.mjs` (18/18 PASS) → compose-log scan (2 ERROR lines, both benign — the documented booking-race duplicate-key line, and one from my own first failed debug run, not a live-stack log line).

## What Worked

- The compare-then-choose (spec 019) `draft` → `selectDraft` flow worked cleanly once I used it correctly; the "balanced" variant was present and the persisted itinerary matched the picked option.
- The anonymous `clientView.itinerary` payload and the `/view/{token}` page are both genuinely clean: zero confidential keys, zero confidential values (agency id, document id, item ids, supplier external ids — all pulled straight from the Postgres row, not re-derived through the app) leaked on either surface.
- Per-item and total price fidelity: every one of the 6 line items' `sellMinor` matched the Postgres-stored draft price exactly, on both the API and the rendered page, and the two surfaces agreed with each other and with the DB.
- The `docker compose exec -T postgres psql ... -tAc` pattern for reading a jsonb column as ground truth (established by `partially-booked-client-view`) worked without modification — a genuinely independent oracle, not a re-query through the same code path being tested.
- Both "unknown token" negative paths (API `not_found`, and the `/view/{bogus}` neutral unavailable page) still work correctly and still never leak platform branding.

## Friction Points

- **e2e support.ts helper staleness recurred, exactly as flagged in my own memory.** The old single-shot `workspace.itinerary.draft` → persisted-itinerary flow that `partially-booked-client-view/scenario.mjs` (iteration 3) was written against no longer exists; spec 019's compare-then-choose flow replaced it. Any new Node-script scenario copying that older file's pattern will hit the same "AI draft persists an itinerary" failure I hit, unless it also adds the `selectDraft` step. The *shared* e2e helper (`tests/e2e/support.ts`'s `draftParisTrip()`) was already fixed for this per a ticket body I found in `.kitchenloop/backlog.json` (from the demo-11-group-travel investigation) — but there is no equivalent shared helper for Node-script scenarios under `scenarios/incubating/`, so each one silently re-implements (and can silently re-break) the same draft flow.
- **React SSR's `<!-- -->` hydration-boundary comments are a real gotcha for any raw-HTML-text scenario assertion**, not just Playwright's rendered-DOM queries. A naive `.includes("Day 1")` or `/Day 1/` check against `fetch().text()` will false-negative on a perfectly correct page. Worth a mention alongside the existing INV-020 rendered-surface-blind-spot pattern in `memory/codebase-patterns.md`, since it's the same root cause (React's SSR text-node splitting) surfacing as a test-writing pitfall rather than a product leak.
- **`derive-coverage.mjs`'s vocabulary guard, working exactly as designed, still went unexercised for a day and a half.** Iteration 5's regress ran the derivation successfully at 00:52 PKT on 2026-07-14; PR #61 (group-travel) merged later the same day at 12:14 PKT with a malformed `KITCHENLOOP-COVERAGE` block; nothing ran `derive-coverage.mjs` again until this iteration's Step 6, ~1.5 days later. The guard did exactly its job (loud failure, not silent corruption) the moment someone finally ran it — but that gap meant the next regress phase would have hit this crash blind. See BUG-1.

## Bugs Found

**BUG-1: `derive-coverage.mjs` hard-crashed on an out-of-vocabulary `KITCHENLOOP-COVERAGE` block shipped by PR #61.** `tests/e2e/group-travel-journey.spec.ts` (spec 021, group travel — Constitution Check PASS, operator-mandated) declared `"feature": "group-travel"` and `"user_type": "agent"`, neither of which exists in `kitchenloop.yaml`'s `spec.dimensions` vocabulary (features: itinerary-builder/content-library/booking/marketplace/trust/revenue-share; user_types: agent-seller/agent-reseller/client). `validateCoverage()` throws on the first mismatch by design (seed-0035) — correct behavior, but it meant the ENTIRE coverage-matrix regeneration was blocked, which would have hit the next regress phase too. Fixed this iteration by removing the malformed block (the underlying Playwright test itself is untouched and still passes — it now just doesn't contribute a matrix combo). Filed ticket `17840666553970558336` and OPERATOR-DESK row `GROUP-TRAVEL-DIMENSION` for the actual decision (should "group-travel" become a formally-tracked 7th feature dimension — it's real, shipped, in-scope P0 functionality per the Constitution Check, just predates the loop's own dimension list). This is a spec-tracking-surface decision (kitchenloop.yaml's dimension vocabulary), not something ideate should decide unilaterally per DIRECTIVE #3 ("spec amendments go through the speckit flow with my review").

No product-code bugs found — the itinerary-builder client-view happy path is solid on both platforms.

## Missing Features

None new this iteration — this was a coverage-declaration/tooling scenario, not a frontier exploration.

## Improvements

**IMP-1: No shared draft-helper for Node-script (`scenarios/incubating/`) scenarios, unlike `tests/e2e/support.ts` for Playwright specs.** Every new L3-style scenario currently re-implements sign-up/org-create/draft/share from scratch by copy-pasting from a prior scenario file, so a planner-flow change (like spec 019's compare-then-choose) silently breaks every future copy until someone hits it manually, exactly as it did here. A shared `scenarios/incubating/_lib/support.mjs` (mirroring the API/tRPC helpers plus a `draftAndPersist(jar, tripRequest)` convenience wrapping the draft→selectDraft two-step) would fix this at the source for the Node-script side, the same way `tests/e2e/support.ts` already does for Playwright specs. Not filed as a ticket this iteration (small, and arguably premature-abstraction territory per the Clean Code Policy until a third scenario needs the exact same fix) — noting it here in case it recurs a third time.

## Tests Added

- `scenarios/incubating/fresh-draft-client-view/scenario.mjs` — new L3-style scenario (66 assertions), declares `itinerary-builder x api x client` and `itinerary-builder x web x client` in its `KITCHENLOOP-COVERAGE` block. Run twice against a fresh `docker compose up --build --wait` stack; both runs 66/66 green.

## Outcome

**SUCCESS.** Coverage moved from 28/36 (77.8%) to 30/36 (83.3%). Full verification green: lint clean, 573/573 vitest (DB-inclusive), 18/18 L3 smoke, compose-log scan clean of unexpected errors. One real tooling bug found and fixed (BUG-1: `derive-coverage.mjs` crash), with the underlying spec-surface question correctly escalated to `OPERATOR-DESK.md` rather than decided unilaterally. No product defects found in the itinerary-builder client-view path itself — it is solid on both platforms.

TIER: T1
