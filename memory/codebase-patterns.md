# Codebase Patterns — tripforge

Patterns confirmed across multiple Kitchen Loop iterations. Updated automatically.

## Testing Patterns

<!-- Patterns related to test structure, test commands, test data -->

- **Rendered-surface blind spots on branding/tenancy invariants (INV-020 class).**
  Playwright `getByText(...)` queries rendered body text only — it can never see
  `document.title` or `<meta>` tags, so a body-text-only negative assertion
  passes while the tab title leaks platform branding. Confirmed iter 1
  (seed-0007: the original e2e INV-020 assertion was false confidence) and
  iter 2 (seed-0011/0012: `tests/e2e/trust-boundary.spec.ts` passed live while
  `/view`'s title was "TripForge"; root `apps/web/app/layout.tsx` metadata is
  inherited by any route group without its own `layout.tsx`). Rule: assert
  branding/tenancy negatives on the FULL rendered surface (`not.toHaveTitle`,
  metadata, raw-HTML regex), and witness every new guard assertion
  red-before/green-after its fix in the same PR (falsifiability).

- **Green L1/L2 is necessary, never sufficient.** In every iteration through
  iter 3 vitest was 100% green while the live built stack (or a live-scenario
  ideate pass) carried real defects found only by live gates: iter 1 →
  false-confidence e2e (seed-0007); iter 2 → non-hermetic Docker build
  (seed-0010), live INV-020 title leak (seed-0011), blind e2e guard
  (seed-0012); iter 3 → booked-price fidelity (BUG-1, seed-0025/PR #36) —
  client view priced a booked trip from the stale draft-time net rate instead
  of the recorded booking's sell price, a cross-module composition seam
  (`packages/domain/src/assemble.ts`, `packages/itinerary-schema/src/item.ts`)
  that every unit in isolation got right and `pnpm test` stayed green through.
  iter 4's live scenario (reseller-builds-fresh) was the first clean pass —
  it specifically re-proved the iter-3 booked-price fix generalizes to a third
  code path (reseller-self-built) rather than finding a new defect. Iter 6's
  live scenario (fresh-draft-client-view: itinerary-builder×{api,web}×client,
  cross-checked against Postgres ground truth) was a second consecutive clean
  pass — zero product defects, only a test-tooling crash (coverage-matrix
  vocabulary guard) and a test-writing pitfall (SSR comment-split text). Iter 7's
  live scenario (traveler-self-book-attempt: trust/booking×client) was a third
  consecutive clean pass for product correctness — but the live browser + network
  trace surfaced a real product GAP (the self-drive "Book it myself" fork fires
  zero mutations; no client-facing self-book procedure exists) that no unit test
  can see because there is no code to unit-test yet. Iter 8's live scenario
  (traveler-marketplace-attempt: marketplace×{web,api}×client) was a fourth
  consecutive clean pass for product correctness AND a second consecutive
  live-surface-reveals-a-roadmap-gap (no consumer marketplace browse/discover/act
  surface — a traveler is FORBIDDEN on every agent marketplace procedure and every
  `clientView.*` marketplace procedure is NOT_FOUND; state fully conserved). Iter 9's
  live scenario (`chat-first-build-to-book`, a T1 robustness probe of the merged
  chat-first flagship) broke the clean-pass streak the RIGHT way: the happy path
  was bulletproof (build+book by conversation, money conserved, zero console
  errors), but pushing past the single pinned e2e into the natural phrasings a
  brand-new user tries surfaced 3 real keyless-FakeLLM extractor gaps + a medium
  bug (BUG-1: a mid-conversation correction is silently dropped AND the assistant
  misleadingly re-confirms the stale value) — none a money/data defect, all
  invisible to the 621/621-green oracle because they live in phrasing-robustness,
  not in any assertion the unit suite makes. The rule holds (never skip the
  INV-027 live gate for product-behavior changes): the live surface is where BOTH
  missing-capability roadmap gaps (iter 7/8) AND real-but-non-money robustness
  defects the oracle can't see (iter 9) become visible — and a T1 "push past the
  pinned path" probe is what turns a green flagship into an honest findings list.

- **Shared test-flow helpers go stale silently when the underlying flow
  changes shape — confirmed 3 times now.** `tests/e2e/support.ts`'s
  `draftParisTrip()` broke after spec 018's SegmentedControl redesign, broke
  again after spec 019's compare-then-choose `draft`→`selectDraft` split, and
  iter 6 hit the identical staleness a third time on the unrelated Node-script
  side (`scenarios/incubating/*/scenario.mjs` has no shared helper at all, so
  `fresh-draft-client-view` had to rediscover the `selectDraft` step by hand
  before it would pass). Rule: any change to a canonical UI/API flow
  (planner draft, booking, auth) must grep every hand-rolled copy of that flow
  — shared or not — not just the one shared helper file; a missing shared
  helper on one side of the test suite is a standing risk, not just a papercut
  (ticket `17840669434037957747` proposes the Node-script-side fix).

- **Vitest + eslint DON'T type-check — real `tsc` breaks hide behind a green
  oracle, and PERSIST because nothing gates them (iter 6→7→8 break; RESOLVED
  iter 9).** The oracle runs `pnpm test` (vitest, which transpiles without strict
  type-checking) and `pnpm run lint` (eslint), neither of which surfaces a
  `tsc --noEmit` error. Iter 6 found a repo-wide typecheck break
  (`chat-edit.test.ts` referencing a removed `ChatEditResult` export) invisible to
  every gate; iter 7 found a different one (`l3-agency-admin.test.ts` 4× TS2345 +
  `l3-booking.test.ts` 2× TS18048, all test-file indexed-access / destructure
  `undefined`-narrowing), and iter 8 confirmed the SAME 6 errors STILL unfixed a
  third consecutive iteration while vitest stayed 619/619 green. All were in TEST
  files, so product code compiled and runtime tests passed — the break was pure
  type-safety debt the oracle can't see, and it persisted for THREE iterations
  precisely because nothing gates it. Iter 9's in-image typecheck came back clean
  (exit 0, 9/9 packages) — the 6 errors were fixed in the merged tree. The
  lesson stands: the break survived 3 iterations *because* the loop's investigative
  typecheck isn't a gate; its eventual fix was incidental (rode in on a merge), not
  loop-enforced, so the same class can silently return. Rule: regress runs
  `pnpm run typecheck` in-image as an investigative check every iteration (cheap,
  layer-cached off the verify image) and tickets/closes breaks against reality;
  whether it JOINS the oracle is a sealed-gate operator decision (desk row
  `TYPECHECK-GATE-GAP` — itself lost/re-filed 3× via REGRESS-ARTIFACT-LOSS), not a
  loop change.

- **State-delta assertions (not just response codes) are the load-bearing
  check on money-conservation scenarios.** L3-style scenarios that assert
  `psql` row-count/sum deltas before/after an operation (booking, licensing,
  markup-ledger conservation) catch composition bugs that response-shape
  checks alone miss — confirmed iter 3 (booking money path, revenue-share
  split conservation) and iter 4 (`reseller-builds-fresh/scenario.mjs`: markup
  ledger zero-delta assertion `43126 === 43126`, booked-price fidelity
  asserted per-item against the ledger sum, not just logged). A scenario that
  only checks HTTP status/shape can pass while a money invariant silently
  breaks; prefer the delta-assertion pattern for any new money-adjacent
  scenario.

## Error Handling Patterns

<!-- Common error handling idioms in this codebase -->

## Performance Patterns

<!-- Performance-sensitive areas, caching strategies -->

- The L1/L2 vitest suite is sub-second (17 tests → 0.34s iter 1; 51 tests →
  0.23s iter 2; 368 tests → 0.88s iter 3, 2.6s with the env-gated L3 specs
  included against live Postgres; 392 tests → iter 4; 483 tests → 1.3s (no
  DB) / 2.9s (DB-inclusive) iter 5; 573 tests → 1.55s (no DB) / 3.0s
  (DB-inclusive) iter 6; 619 tests → 3.0s (DB-inclusive, 63 files) iter 7;
  619 tests → 3.19s (DB-inclusive, 63 files) iter 8, unchanged — no test files
  landed on the iter-8 branch (campaign-sync + ideate only);
  621 tests → 3.08s (DB-inclusive, 63 files) iter 9, +2 tests from the
  now-merged chat-first PR #7).
  Cost is never a reason to skip or subset it.

## Integration Patterns

<!-- External service integration patterns, API clients -->

## Architecture Patterns

<!-- Structural patterns, module organization, dependency flow -->

- **RESOLVED (confirmed iter 5): the coverage-matrix drift is fixed by the
  seed-0031 derivation tool.** Previously (iter 3–4) `.kitchenloop/coverage-matrix.yaml`
  was appended by hand at ideate time and independently hand-summarized into
  `loop-state.md`'s Coverage prose at regress time — two representations of
  the same fact with no mechanism keeping them in sync, confirmed drifting
  twice (iter 3's REGRESS-ARTIFACT-LOSS backfill; iter 4's matrix showing
  17/36 against loop-state.md's stale 30/36 claim). PR #46 landed
  `scripts/kitchenloop/derive-coverage.mjs`, which regenerates the matrix's
  `tested`/`tested_combos`/`coverage_pct` fields from each scenario file's own
  `KITCHENLOOP-COVERAGE` declaration — it is now the sole writer, never
  hand-edited. Iter 5 re-ran the derivation and got a byte-for-byte match
  against the committed file (28/36, zero working-tree diff), confirming the
  fix holds a second time. Iter 6 (30/36), iter 7 (31/36), iter 8 (33/36), and
  iter 9 (33/36, unchanged — a T1 robustness re-cover of an already-tested cell)
  all regenerated clean (exit 0, no vocabulary crash after PR #74 removed the
  out-of-vocab group-travel block) — a 6th consecutive iteration the tool is the
  sole writer.
  Regress should keep running
  `derive-coverage.mjs` each iteration (its own exit code flags malformed
  scenario blocks) rather than reconciling the matrix by hand.
