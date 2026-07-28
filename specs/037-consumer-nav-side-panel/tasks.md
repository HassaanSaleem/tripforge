# Tasks: Consumer-surface navigation side panel (signed-in traveler)

**Feature dir**: `specs/037-consumer-nav-side-panel/` · **Spec**: spec.md · **Plan**: plan.md

Dependency-ordered. `[P]` = parallelizable with the task above it (no shared file).
Every task maps to functional requirements (FR-nnn) from spec.md.

## Phase A — Nav data (source of truth)

- **T001** — Create `apps/web/lib/client-nav.ts`: `ClientNavDestinationId` union,
  `ClientNavIconKind` union, `ClientNavDestination` interface (`id`, `label`,
  `href: string | null`, `status: "live" | "soon"`, `icon`), and
  `CLIENT_NAV_DESTINATIONS` with the 5 rows from data-model.md. Pure data, DOM-free.
  (FR-001, FR-002, FR-003)
- **T002** — Create `apps/web/lib/__tests__/client-nav.test.ts` (L1): assert INV-A
  (live⇔href, soon⇔null), INV-B (unique ids), INV-C (exact order), INV-D (no
  "TripForge"/"Trellis" in any label). (FR-003, FR-004)

## Phase B — Consumer shell components

- **T003** — Create `apps/web/app/(client-view)/view/components/client-nav-sidebar.tsx`:
  a stateless, server-renderable sidebar (no `"use client"`). Renders a checkbox
  toggle (`#tf-client-nav-toggle`) + `<nav aria-label="Traveler navigation">` with
  the destinations from `client-nav.ts` (live → `<Link>` with `aria-current` on the
  active id; soon → non-link `<span>` with a "Soon" badge) + an Account region
  containing the traveler name (optional) and the reused `TravelerSignOut`. Local
  inline SVG icons (home, suitcase, sparkle, compass, users, user). Brand-neutral
  wordmark — no "TripForge"/"Trellis". (FR-001, FR-002, FR-003, FR-004, FR-006, FR-007)
- **T004** — Create `apps/web/app/(client-view)/view/components/client-surface-shell.tsx`:
  a server component taking `{ activeNav, travelerName, children }`; renders
  `<div className="tf-app-shell tf-client-shell" data-plain>` → `<ClientNavSidebar>`
  + `<div className="tf-app-shell-content"><main className="tf-client-main">{children}</main></div>`.
  No agency identity, no membership guard, no platform wordmark. (FR-001, FR-004, FR-006, FR-008)

## Phase C — Styles (additive, reuse the theme kit)

- **T005** — Extend `apps/web/app/globals.css` additively: `.tf-client-shell` tweaks
  if needed, `.tf-client-nav-*` (brand-neutral wordmark, Account region), coming-soon
  nav-item styling (muted, `aria-disabled`, "Soon" badge), and confirm the reused
  `.tf-app-shell`/`.tf-sidebar` responsive collapse applies. No new responsive
  system; no per-page style fork. (FR-008)

## Phase D — Wire the signed-in pages

- **T006** — Edit `apps/web/app/(client-view)/view/page.tsx`: wrap ONLY the
  signed-in `TravelerHome` render in `<ClientSurfaceShell activeNav="home"
  travelerName={name}>`. Leave `AnonymousWelcome` byte-unchanged. Keep the existing
  `home-my-trips`/`home-plan`/`home-discover` tiles and `traveler-home-greeting`.
  Move the footer sign-out reliance to the shell's Account area (retain the
  `home-sign-out` testid so the pinned test stays green). (FR-001, FR-005, FR-007)
- **T007** — Edit `apps/web/app/(client-view)/view/my-trips/page.tsx`: after the
  auth redirect, add a parallel `clientView.me()` read and wrap the content in
  `<ClientSurfaceShell activeNav="myTrips" travelerName={name}>`. Unauthenticated
  redirect path untouched. (FR-001, FR-002, FR-005)

## Phase E — e2e coverage (L4, INV-027)

- **T008** — Create `tests/e2e/consumer-nav-journey.spec.ts`: (a) signed-in traveler
  sees the panel on `/view`, navigates panel→My Trips→Home with `aria-current`
  tracking, coming-soon items are non-links, sign-out from the panel returns to the
  anonymous welcome; (b) anonymous `/view` and a real `/view/[token]` share link
  render NO panel and no "TripForge"/"Trellis" (INV-020/INV-018 unchanged); (c) no
  "Agency workspace" affordance on the traveler surface (INV-024). Select by testid /
  exact names; scope the panel via `getByRole("navigation", { name: "Traveler
  navigation" })`. (FR-001…FR-007)

## Phase F — Verify

- **T009** — `pnpm run lint` (in built image), `pnpm test` (full suite in built
  image), full Playwright e2e suite (not isolated — per e2e-support-helper-staleness).
- **T010** — INV-027 Live Test & Fix: boot built compose, run smoke + e2e, drive the
  browser journey (quickstart.md) with per-step screenshots incl. ~390px viewport,
  scan compose logs against the allowlist. Fix any defect in-cycle.

## Traceability

| FR | Tasks |
|----|-------|
| FR-001 nav present + items | T001, T003, T004, T006, T007, T008 |
| FR-002 links + active marker | T001, T003, T006, T007, T008 |
| FR-003 coming-soon non-links | T001, T002, T003, T008 |
| FR-004 no platform brand | T002, T003, T004, T008 |
| FR-005 anonymous unchanged | T006, T008 |
| FR-006 no workspace affordance / distinct module | T003, T004, T008 |
| FR-007 sign-out from panel | T003, T006, T008 |
| FR-008 responsive + theme-aware | T004, T005, T010 |
