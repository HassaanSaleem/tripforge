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

- **Green L1/L2 is necessary, never sufficient.** In both iterations vitest was
  100% green while the live built stack carried real defects found only by the
  live gates: iter 1 → false-confidence e2e (seed-0007); iter 2 → non-hermetic
  Docker build (seed-0010), live INV-020 title leak (seed-0011), blind e2e guard
  (seed-0012). The INV-027 live-verification gate (built compose image + real
  browser + log scan) is where this codebase's real bugs surface — never skip it
  for product-behavior changes.

## Error Handling Patterns

<!-- Common error handling idioms in this codebase -->

## Performance Patterns

<!-- Performance-sensitive areas, caching strategies -->

- The L1/L2 vitest suite is sub-second (17 tests → 0.34s iter 1; 51 tests →
  0.23s iter 2). Cost is never a reason to skip or subset it.

## Integration Patterns

<!-- External service integration patterns, API clients -->

## Architecture Patterns

<!-- Structural patterns, module organization, dependency flow -->
