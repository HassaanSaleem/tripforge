# Tasks: Consumer "What's Hot" Discovery Feed

**Feature**: 039-consumer-whats-hot-feed | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Dependency-ordered. `[P]` = parallelizable with the task above it (different files, no ordering dependency).

## Phase A — Extract & generalize the shared feed UI (no behavior change)

- [ ] **T001** Create `apps/web/app/components/discover-feed-card.tsx` by moving `apps/web/app/(workspace)/discover/feed-item-card.tsx`, renaming the export to `DiscoverFeedCard`, and adding a required `planPath: string` prop. Build the link as `` `${planPath}?destination=${encodeURIComponent(item.planDestination)}` ``. Import `DiscoverFeedItem` from `../../lib/discover-feed.js` (fix the relative path for the new location). Preserve **every** `data-testid` and class name unchanged (`discover-feed-card`, `discover-hotel-highlight`, `discover-plan-this`, `discover-card-image-fallback`, `tf-discover-card*`). (FR-005, FR-010; research D2)
- [ ] **T002** Create `apps/web/app/components/discover-feed-view.tsx` by moving `apps/web/app/(workspace)/discover/discover-feed-view.tsx`, adding a required `planPath: string` prop, importing the new `DiscoverFeedCard`, and threading `planPath` to each card. Preserve the picker testids/classes (`discover-destination-picker`, `discover-destination-option`, `discover-feed-grid`). Import `HERO_DESTINATIONS`/`feedItemsForDestination` from the corrected relative path (`../../lib/...`). (FR-004; research D2)
- [ ] **T003** Delete the two old files (`apps/web/app/(workspace)/discover/feed-item-card.tsx`, `discover-feed-view.tsx`) and update `apps/web/app/(workspace)/discover/page.tsx` to import `DiscoverFeedView` from `../../components/discover-feed-view.js` and render `<DiscoverFeedView planPath="/workspace" />`. Workspace Discover behavior MUST be unchanged. (Plan Structure; INV-024)

## Phase B — Consumer planner seed

- [ ] **T004** In `apps/web/app/(client-view)/view/plan/consumer-planner.tsx`, add optional `initialDestination?: string` to `ConsumerPlanner` props and initialize `draftText` state to `initialDestination ? \`Plan a trip to ${initialDestination}\` : ""`. Do NOT auto-submit or alter any other step. (FR-006, FR-007; contract)
- [ ] **T005** In `apps/web/app/(client-view)/view/plan/page.tsx`, accept `searchParams: Promise<{ destination?: string | string[] }>`, compute `initialDestination = typeof destination === "string" && destination.trim() ? destination : undefined`, and pass it to `<ConsumerPlanner … initialDestination={initialDestination} />`. Keep `dynamic = "force-dynamic"`. (FR-006; contract)

## Phase C — Consumer Discover page + nav

- [ ] **T006** Rewrite `apps/web/app/(client-view)/view/discover/page.tsx`: signed-in gate via `getSessionContext(await headers())` → `redirect("/view/sign-in")` when anonymous; else fetch traveler name via the authenticated caller's `clientView.me()` (mirror `/view/plan/page.tsx`) and render inside `<ClientSurfaceShell activeNav="discover" travelerName={name}>` a brand-neutral header + `<DiscoverFeedView planPath="/view/plan" />`. Keep `export const dynamic = "force-dynamic"` and `robots: { index:false, follow:false }`. Remove the `DiscoveryComing` import. (FR-001, FR-002, FR-005, FR-011; research D4)
- [ ] **T007** In `apps/web/lib/client-nav.ts`, flip the `discover` destination to `{ id:"discover", label:"Discover", href:"/view/discover", status:"live", icon:"compass" }`. Leave `groupTrips` as "soon". (FR-008; research D5)

## Phase D — Tests

- [ ] **T008** [P] Unit: `apps/web/app/components/__tests__/discover-feed-card.test.tsx` (or extend existing feed test) — assert the "Plan this" href is `${planPath}?destination=${encoded}` for both `planPath="/view/plan"` and `planPath="/workspace"`; assert image-load-failure swaps to the labeled fallback while blurb/hotel/Plan-this remain. (FR-005, FR-010)
- [ ] **T009** e2e: `tests/e2e/consumer-discover-journey.spec.ts` — sign up a traveler; open Discover from nav (assert live link + active marker); pick a destination, assert ≥3 `discover-feed-card`s with image/blurb/hotel; switch destination, assert content replaced; click a card's `discover-plan-this`, assert URL `/view/plan?destination=…` and the composer pre-filled `Plan a trip to …`; assert the page body/title carry no `TripForge`/`Trellis` (INV-020 negative); signed-out `/view/discover` → redirected to sign-in. (US1, US2, US3, FR-002)
- [ ] **T010** Regression guard: run `tests/e2e/discover-journey.spec.ts` (workspace) and the full `pnpm test` — the extraction must not break the agent-side Discover or any consumer-planner test. (T003, INV-024)

## Phase E — Verify

- [ ] **T011** `pnpm run lint` + `pnpm test` (in the built image) green; `npx playwright test` green (consumer + workspace discover + planner journeys).
- [ ] **T012** INV-027 Live Test & Fix: boot the built compose stack, drive the quickstart journey in a real browser with per-step screenshots, scan compose logs, fix any defect in-cycle (max 3 cycles). Evidence → PR "Live Test Evidence" section.

## Traceability

| FR | Task(s) |
|----|---------|
| FR-001 consumer Discover renders real feed | T006 |
| FR-002 signed-in gate / no token fall-through | T006, T009 |
| FR-003 ≥3 items, image/blurb/hotel | T002 (reused data), T009 |
| FR-004 picker switches content | T002, T009 |
| FR-005 "Plan this" → consumer planner | T001, T006, T008, T009 |
| FR-006 planner accepts seed | T004, T005, T009 |
| FR-007 seed does not auto-submit/bypass | T004, T009 |
| FR-008 nav entry live | T007, T009 |
| FR-009 licensed/attributed imagery | T002 (reused data) |
| FR-010 image-fail fallback | T001, T008 |
| FR-011 brand-neutral | T006, T009 |
| FR-012 no workspace-component import | T001–T003, T006 |
| FR-013 no schema/money/supply/revshare change | all (none touch those files) |
