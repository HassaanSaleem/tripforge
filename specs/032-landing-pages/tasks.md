# Tasks: Two-sided landing pages (global + travelers + agents)

**Feature dir**: `specs/032-landing-pages/` · **Branch**: `kitchen/fix-goal-landing-pages-two-sided`

Dependency-ordered. `[P]` = parallelizable (touches a different file). Presentation/routing only — no server, schema, money, supply-adapter, or auth changes.

## Phase A — Shared surface

- [ ] **T001** Add a shared marketing nav server component `apps/web/app/components/marketing-nav.tsx`: brand link → `/`, links → `/for-travelers`, `/for-agents`, traveler sign-in (`/view/sign-in`), agent sign-in (`/sign-in`). Accessible names: "For travelers", "For agents", "Traveler sign in", "Agent sign in" — deliberately disjoint from existing home labels (D6, memory e2e-nav-label-substring-collision). No `"use client"`.
- [ ] **T002** Extend `apps/web/app/globals.css` with an ADDITIVE marketing section (new comment header) reusing existing tokens: a two-sided split layout for the home fork (`.home-split`, `.home-side` cards) and marketing-page classes (`.lp-*` — hero, video frame, story grid, CTA row). Responsive single-column reflow at ≤880px and no horizontal overflow at ~375px. No new tokens, no `prefers-color-scheme` dark overrides (D7). (Covers FR-010/FR-011.)

## Phase B — Pages (each [P] — distinct files, all depend on T001/T002)

- [ ] **T003** [P] Rework `apps/web/app/page.tsx` into a two-sided overview (FR-001): keep the hero polish, add a visible split into a **For travelers** panel (→ `/for-travelers`) and a **For agents** panel (→ `/for-agents`); use the shared `MarketingNav`. MUST preserve a heading named "TripForge" (FR-002) and a link matching /Agency workspace/i (FR-002; the agent panel/CTA carries an "Agency workspace" link). Server component.
- [ ] **T004** [P] Create `apps/web/app/for-travelers/page.tsx` (FR-003/004/005): `MarketingNav` + consumer story (plan with AI → live-priced bookable itinerary → self-drive OR request an agent, funnelling to the network per Principle I) + `<video controls preload="metadata" poster="/shots/clients/01-shared-trip.png"><source src="/demos/tripforge-clients.mp4" type="video/mp4"></video>` (no autoplay) + primary CTA → `/view/sign-in`. Add page `metadata` (title/description). Server component.
- [ ] **T005** [P] Create `apps/web/app/for-agents/page.tsx` (FR-006/007/008): `MarketingNav` + professional story (budget-aware AI builder; net-rate quote-then-book with markup control; two-sided marketplace resell/white-label) + `<video controls preload="metadata" poster="/shots/agent/01-dashboard.png"><source src="/demos/tripforge-agents.mp4" type="video/mp4"></video>` (no autoplay) + primary CTA → `/sign-up`. Add page `metadata`. Server component.

## Phase C — Tests

- [ ] **T006** Add `tests/e2e/landing-pages-journey.spec.ts` (FR-014, SC-001/002/003/004): (a) `/` shows heading "TripForge" + both fork links; (b) nav round-trip Home ↔ For travelers ↔ For agents reaches every page; (c) on each marketing page a `video` element is present with a `poster` attr and no `autoplay`/`muted`-autoplay, and the `source` points at the expected `/demos/*.mp4`; (d) traveler CTA → `/view/sign-in`, agent CTA → `/sign-up`; (e) at a 375px viewport `document.scrollingElement.scrollWidth <= clientWidth` (no horizontal scroll) on all three. Prefer `exact`/role-scoped locators to avoid substring collisions.
- [ ] **T007** Confirm `tests/e2e/smoke.spec.ts` still passes unchanged against the reworked home (heading "TripForge" + /Agency workspace/i link) — do NOT edit the smoke spec (SC-005).

## Phase D — Gates (per execute SKILL step 4)

- [ ] **T008** `pnpm run lint` clean; `pnpm test` (in the built image) full suite green including smoke.
- [ ] **T009** Live Test & Fix (INV-027): boot built stack, run smoke.mjs + e2e, drive all three routes + nav + video + 375px reflow in Playwright MCP with per-step screenshots to `.kitchenloop/evidence/7/goal-landing-pages/`, scan compose logs, fix defects in-cycle.
- [ ] **T010** UAT card + zero-context evaluator + PR to `campaign/two-sided-surface` with all mandatory body sections (Ticket, Pre-Write decision, spec-alignment table, Live Test Evidence); transition ticket → `in_review`.

## Traceability (FR → task)

| FR | Task(s) |
|----|---------|
| FR-001 two-sided overview | T003 |
| FR-002 preserve smoke assertions | T003, T007 |
| FR-003 travelers story (Principle I framing) | T004 |
| FR-004 travelers demo video (poster/metadata/no-autoplay) | T004 |
| FR-005 travelers CTA → sign-in | T004 |
| FR-006 agents story | T005 |
| FR-007 agents demo video | T005 |
| FR-008 agents CTA → sign-up | T005 |
| FR-009 shared nav across all three | T001, T003, T004, T005 |
| FR-010 no horizontal scroll @375px | T002, T006 |
| FR-011 shared token system | T002 |
| FR-012 real staged assets only | T004, T005 |
| FR-013 no server/schema/money/auth change | (whole feature — presentation only) |
| FR-014 e2e nav coverage + smoke green | T006, T007 |
