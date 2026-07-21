# Phase 0 Research: Two-sided landing pages

## Decisions

### D1 — Native `<video>` vs. a player library
**Decision**: Use the native HTML `<video controls preload="metadata" poster=…>` with a `<source type="video/mp4">`.
**Rationale**: The assets are plain MP4s; the browser's native controls satisfy every requirement (play/pause, volume, fullscreen) with zero JS, zero dependency, and no bundle cost. A player library would add weight and a client component for no benefit.
**Alternatives rejected**: `react-player`/custom controls — unnecessary complexity, adds client JS and a dependency, none of which the spec requires.

### D2 — No autoplay; user-initiated playback
**Decision**: Omit `autoPlay`; set `preload="metadata"` and a `poster`.
**Rationale**: FR-004/FR-007 forbid autoplay-with-sound; `preload="metadata"` avoids downloading the ~20MB agent demo until the user presses play (weight + data-cost win); the poster gives an immediate, real product frame. Respects `prefers-reduced-motion` by never auto-animating.

### D3 — Server components (no client JS)
**Decision**: All three pages and the shared nav are server components (no `"use client"`).
**Rationale**: They render static markup and links only. `next/link` works in server components. No interactivity, no hooks, no state — keeps them fast and simple, consistent with the current `page.tsx` (a server component).

### D4 — Marketing routes at app root, not in a route group
**Decision**: `apps/web/app/for-travelers/page.tsx` and `apps/web/app/for-agents/page.tsx` at the app root, inheriting the root `layout.tsx`.
**Rationale**: They must carry the product theme (NOT the brand-neutral `(client-view)` white-label layout — INV-020 — and NOT the agent-gated `(workspace)` group). App-root routes inherit `layout.tsx` + `globals.css` and are anonymously public, matching the existing `/`.

### D5 — Shared nav as one component
**Decision**: A single `apps/web/app/components/marketing-nav.tsx` used by all three pages.
**Rationale**: Keeps link labels and targets identical across pages (FR-009), so the nav can't drift page-to-page and the e2e journey can rely on stable accessible names.

### D6 — Nav label choice avoids the getByRole substring-collision class
**Decision**: Use accessible names "For travelers" and "For agents" for the new nav links (and keep the traveler sign-in labelled distinctly, e.g. "Traveler sign in").
**Rationale**: Memory `e2e-nav-label-substring-collision` — Playwright `getByRole(name)` is substring-based, so a new label that is a substring of, or contains, an existing one breaks unrelated specs. "For travelers"/"For agents" are disjoint from the existing home labels ("Travelers", "Agent sign in", "Agency workspace →", "Start free"). The e2e journey will prefer `getByRole("link", { name: "For travelers", exact: true })` where ambiguity is possible.

### D7 — Additive CSS only; no dark palette
**Decision**: Add a new commented marketing section to `globals.css` reusing existing tokens; do NOT add `@media (prefers-color-scheme: dark)` overrides.
**Rationale**: The token set is light-only today; a dark palette would alter EVERY surface (all use these tokens) — a cross-cutting change owned by `goal-ui-depoliteform`, and risky here (visual regressions elsewhere). "Theme-aware" is satisfied by building on the shared tokens; dark palette is explicitly deferred (spec Assumptions).

### D8 — Preserve the home smoke assertions
**Decision**: The reworked `/` keeps a heading whose accessible name is "TripForge" and a link matching /Agency workspace/i.
**Rationale**: `tests/e2e/smoke.spec.ts` pins both; FR-002/FR-014/SC-005 require zero smoke regression. The agent fork/CTA on the home page will use the "Agency workspace" affordance to satisfy the link assertion naturally.

## Open questions
None — all resolved by reasonable defaults recorded in the spec's Assumptions.
