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
  code path (reseller-self-built) rather than finding a new defect. The rule
  still holds (never skip the INV-027 live gate for product-behavior changes)
  even though it doesn't guarantee a bug every time.

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
  included against live Postgres). Cost is never a reason to skip or subset it.

## Integration Patterns

<!-- External service integration patterns, API clients -->

## Architecture Patterns

<!-- Structural patterns, module organization, dependency flow -->

- **Hand-maintained duplicate bookkeeping (coverage-matrix.yaml ↔
  loop-state.md prose) silently drifts without a derivation link.**
  `.kitchenloop/coverage-matrix.yaml` is appended by hand at ideate time and
  independently hand-summarized into `loop-state.md`'s Coverage prose at
  regress time — two representations of the same fact with no mechanism
  keeping them in sync. Confirmed twice: iter 3 lost an in-progress matrix
  update mid-iteration (the file's own header notes a "REGRESS-ARTIFACT-LOSS"
  backfill) and loop-state.md separately claimed 30/36 that was never
  committed to the matrix; iter 4's ideate pass independently rediscovered
  the same disagreement (matrix showed 17/36, loop-state.md claimed 30/36,
  neither matched the real scenario files) and had to hand-read all 6
  `scenarios/incubating/*/scenario.mjs` files to find the true coverage gap.
  Filed as seed-0031 with a fix (structured coverage-claim + derivation tool)
  bundled in PR #46. Until that lands, treat `coverage-matrix.yaml`'s on-disk
  number as the source of truth over any prose restatement, and expect it to
  undercount.
