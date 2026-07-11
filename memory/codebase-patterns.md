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

- **Green L1/L2 is necessary, never sufficient.** In every iteration so far
  vitest was 100% green while the live built stack (or a live-scenario ideate
  pass) carried real defects found only by live gates: iter 1 → false-confidence
  e2e (seed-0007); iter 2 → non-hermetic Docker build (seed-0010), live INV-020
  title leak (seed-0011), blind e2e guard (seed-0012); iter 3 → booked-price
  fidelity (BUG-1, seed-0025/PR #36) — client view priced a booked trip from the
  stale draft-time net rate instead of the recorded booking's sell price, a
  cross-module composition seam (`packages/domain/src/assemble.ts`,
  `packages/itinerary-schema/src/item.ts`) that every unit in isolation got
  right and `pnpm test` stayed green through. The failure class is deepening,
  not just repeating: iter 2 caught build/render-surface leaks, iter 3 caught a
  cross-module money-composition bug. The INV-027 live-verification gate (built
  compose image + real browser + log scan) is where this codebase's real bugs
  surface — never skip it for product-behavior changes.

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
