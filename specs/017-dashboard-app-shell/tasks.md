# Tasks: Dashboard App Shell

**Input**: Design documents from `specs/017-dashboard-app-shell/`
**Prerequisites**: plan.md, research.md (D1–D9), data-model.md,
contracts/dashboard-shell-ui.md, quickstart.md

**Tests**: REQUIRED — contract §6 fixes the L1/L3/L4 obligations; the repo
quality bar makes live verification (INV-027) part of every product-behavior
cycle. No existing assertion may be weakened.

**Organization**: grouped by user story (spec.md US1 dashboard / US2 sidebar
reachability / US3 capability parity) so each story lands as an
independently testable increment, on top of one shared foundational shell.

## Phase 1: Setup

- [x] T001 [P] Create `apps/web/lib/nav.ts`: the single `NavDestination`
      source of truth (id/label/href/icon for all six destinations —
      research D8, data-model "Nav Destination"). No JSX yet, pure data +
      inline SVG factory functions.
- [x] T002 [P] L1 test `apps/web/lib/__tests__/nav.test.ts`: exactly six
      destinations, ids match `WorkspacePageShell`'s widened `activeNav`
      union, href/label pairs stable (contract §6).

## Phase 2: Foundational (blocking all stories)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Widen `activeNav` prop type on `WorkspacePageShell`
      (`apps/web/app/(workspace)/components/workspace-page-shell.tsx`) from
      `"workspace" | "marketplace"` to
      `"dashboard" | "builder" | "trips" | "marketplace" | "media" | "discover"`
      (research D3).
- [x] T004 Create `apps/web/app/(workspace)/components/app-sidebar.tsx`:
      renders the six `nav.ts` destinations as a `<nav>`/`<ul>` list with
      `aria-current="page"` on the active item, plus a checkbox-driven
      collapse toggle for narrow viewports (research D4 — CSS-only, no
      `"use client"`, no new state).
- [x] T005 Wire `<AppSidebar>` into `WorkspacePageShell`'s verified-agent
      branch, inside a new `.tf-app-shell` wrapper (header + sidebar +
      `<main>`); remove the old top `.tf-nav` Workspace/Marketplace links
      (superseded by the sidebar, research D3). The no-identity guard branch
      is untouched (no sidebar for non-members).
- [x] T006 [P] Add shell/sidebar kit CSS to `apps/web/app/globals.css`:
      `.tf-app-shell` (sidebar+content grid), `.tf-sidebar` and its active/
      collapse-toggle states, and the `.tf-app-shell main` width-override
      rule (research D9 — same specificity technique as `[data-plain] main`;
      landing/auth pages, which don't use this class, are unaffected).

**Checkpoint**: every existing page using `WorkspacePageShell` (today:
`/workspace`, `/marketplace`) now renders with the sidebar and unchanged top
header — foundation ready for the three user stories below.

---

## Phase 3: User Story 1 — Land on a real dashboard (P1) 🎯 MVP

**Goal**: A new `/dashboard` Agent Home becomes the post-sign-in landing,
showing real (possibly-zero) stat tiles, recent activity, and quick actions.

**Independent Test**: Sign in and observe `/dashboard` — sidebar present,
stat tiles/activity/quick-actions all render correctly for both a zero-
activity and a populated agency.

### Tests for User Story 1

- [x] T007 [P] [US1] L3 test `packages/api/src/__tests__/l3-dashboard-stats.test.ts`
      against real Postgres: two-tenant isolation (agency A's stats never
      include B's rows); a fresh agency returns all-zero/empty (never an
      error); a booking in currency X and one in currency Y are returned as
      two separate `gbvByCurrency` entries, never summed together (contract
      §6, data-model validation rules).

### Implementation for User Story 1

- [x] T008 [US1] Create `packages/api/src/services/dashboard-stats.ts`:
      `dashboardStats(db, agencyId)` — `sum()`/`count()` aggregates scoped by
      `agencyId` at the query, mirroring `packages/marketplace/src/earnings.ts`'s
      `earningsAggregates` shape (research D5): `gbvByCurrency` (from
      `booking_component.sell_minor` via `booking`/`itinerary`),
      `earningsByCurrency` (from `revenue_share_ledger.seller_credit_minor`),
      `activeTripCount`, `listingCount`, `licenseCount`, and `recentActivity`
      (newest-first synthesized labels, fixed cap — research D6). Depends on
      T001 only for type conventions, otherwise independent.
- [x] T009 [US1] Add `dashboard.stats` query procedure to
      `packages/api/src/routers/workspace.ts` (agent-gated `agentProcedure`,
      INV-023), calling `dashboardStats` from T008 (depends on T008).
- [x] T010 [US1] Create `apps/web/app/(workspace)/dashboard/dashboard-home.tsx`
      (client component): calls `workspace.dashboard.stats`, renders stat
      tiles (`.tf-stat-tile`), a recent-activity list with an empty-state
      copy, and two quick-action cards ("Start a new trip" → `/workspace`,
      "Browse marketplace" → `/marketplace`). Loading/zero/populated/failed
      states per contract §4. Money values render through the existing
      `formatMinorAmount`-style formatter only — zero client arithmetic
      (depends on T009).
- [x] T011 [US1] Create `apps/web/app/(workspace)/dashboard/page.tsx`: server
      component gating via `getWorkspaceIdentity`, composes
      `WorkspacePageShell activeNav="dashboard"` +
      `<DashboardHome />` (depends on T005, T010).
- [x] T012 [P] [US1] Add dashboard kit CSS to `apps/web/app/globals.css`:
      `.tf-stat-grid`/`.tf-stat-tile`, `.tf-activity*`, `.tf-quick-action*`
      (research D9, existing tokens only).
- [x] T013 [US1] Update `apps/web/app/(workspace)/sign-in/page.tsx` and
      `apps/web/app/(workspace)/sign-up/page.tsx` redirect targets from
      `/workspace` to `/dashboard` (depends on T011 existing).

**Checkpoint**: signing in now lands on a working dashboard with correct
zero-state and populated-state stats — independently testable and
demoable even before Phase 4/5 land.

---

## Phase 4: User Story 3 — Every existing capability still works (P1)

**Goal**: Planner/Trips/Media each get their own nav destination with zero
loss of function; no money-path regression.

**Independent Test**: From the dashboard, reach AI Builder/Trips/Media each
via the sidebar and complete draft/reopen/book/share/media actions exactly
as before.

### Implementation for User Story 3

- [x] T014 [US3] Create `apps/web/app/(workspace)/trips/page.tsx`: server
      component gating via `getWorkspaceIdentity`, composes
      `WorkspacePageShell activeNav="trips"` + `<ItineraryList />` (depends
      on T005).
- [x] T015 [US3] Create `apps/web/app/(workspace)/media/page.tsx`: server
      component gating via `getWorkspaceIdentity`, composes
      `WorkspacePageShell activeNav="media"` + `<MediaLibraryPanel />`
      (depends on T005).
- [x] T016 [US3] Modify `apps/web/app/(workspace)/workspace/page.tsx`:
      `activeNav="builder"`, render `<Planner />` directly (drop
      `<WorkspacePanels />`); delete
      `apps/web/app/(workspace)/workspace/workspace-panels.tsx` (research
      D2 — dead once panels are no longer page siblings).
- [x] T017 [US3] Remove the now-unused `onDrafted` prop and its invocation
      from `apps/web/app/(workspace)/workspace/planner.tsx` (grep first to
      confirm no other caller — research D2).
- [x] T018 [US3] Remove the now-unused `refreshToken` prop and its effect
      dependency from `apps/web/app/(workspace)/workspace/itinerary-list.tsx`
      (grep first to confirm no other caller — research D2); the component
      fetches once on mount, which is now the only trigger it needs.
- [x] T019 [P] [US3] Update `tests/e2e/workspace-list-journey.spec.ts`:
      navigate to `/trips` instead of `/workspace` (contract §6); no
      assertion weakened.
- [x] T020 [P] [US3] Update `tests/e2e/content-library-journey.spec.ts`:
      navigate to `/media` instead of `/workspace` (contract §6); no
      assertion weakened.
- [x] T021 [P] [US3] **Deviation from plan**: `planner-journey.spec.ts` was
      NOT unmodified — sign-up/sign-in now land on `/dashboard`, so both
      tests needed an explicit `page.goto("/workspace")` inserted before
      interacting with the planner form (the plan's D1 assumption that only
      Trips/Media callers needed navigation fixes was incomplete; every
      caller of `signUpAgency`/`signInAgency` that immediately used a
      panel needed the same fix — also applied to `content-library-journey`,
      `booking-journey` (via `draftParisTrip` self-navigating, no per-file
      edit needed), `marketplace-journey`, and `workspace-list-journey`).
      No assertion weakened; `booking-journey.spec.ts`/`client-view-journey.spec.ts`/
      `listing-terms-integrity.spec.ts` needed no edits (they either call
      `draftParisTrip`, which now self-navigates, or already `page.goto`
      explicitly before their panel-specific step).
- [x] T022 [US3] Update `tests/e2e/sign-in.spec.ts`: post-sign-in/-up landing
      assertions and the "already signed in" redirect assertion now target
      `/dashboard` (depends on T013).

**Checkpoint**: draft/reopen/book/share/media/marketplace all verified
working end-to-end from their own nav destinations — zero function lost.

---

## Phase 5: User Story 2 — Get anywhere from one persistent sidebar (P1)

**Goal**: All six destinations (including the new Discover placeholder) are
reachable and correctly marked active from any authenticated screen, with a
working collapse on narrow viewports.

**Independent Test**: From any screen, select each of the six sidebar items
in turn and confirm correct destination + active marking; narrow the
viewport and confirm the sidebar still opens and navigates.

### Implementation for User Story 2

- [x] T023 [US2] Create `apps/web/app/(workspace)/discover/page.tsx`: server
      component gating via `getWorkspaceIdentity`, composes
      `WorkspacePageShell activeNav="discover"` + a static on-brand
      "coming soon" card (no data fetch — research D7; depends on T005).
- [x] T024 [US2] Confirm/verify `apps/web/app/(workspace)/marketplace/page.tsx`
      compiles against the widened `activeNav` type with no behavior change
      (depends on T003).
- [x] T025 [P] [US2] New e2e `tests/e2e/dashboard-shell-journey.spec.ts`:
      sign-in lands on `/dashboard`; select each of the six sidebar items in
      turn and assert the correct route + active marking; assert a fresh
      agency's dashboard renders a full zero-state (contract §6); narrow the
      viewport and assert the sidebar collapses and remains operable
      (depends on T010–T023 all existing).
- [x] T026 [US2] Extend `tests/e2e/dashboard-shell-journey.spec.ts` (or add a
      dedicated case) covering the populated-dashboard path: draft → book →
      list → license live, then assert the dashboard's stat tiles and
      recent-activity reflect it (spec SC-004; depends on T008–T023 all
      existing across both agencies for the tenant-isolation spot-check).

**Checkpoint**: all six destinations reachable and correctly marked from
every screen; collapse behavior verified; full journey e2e green.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T027 [P] Run `pnpm run lint` and fix any findings across all touched
      files.
- [x] T028 Run the full `pnpm test` suite (L1/L2/L3) inside the built image;
      confirm zero regressions vs. the pre-feature baseline.
- [x] T029 Run `quickstart.md` end-to-end against the built compose image
      (INV-027 Live Test & Fix): boot, deterministic suites, the manual
      browser journey (steps 1–10), log scan, teardown.
- [x] T030 [P] Grep the diff for any remaining reference to
      `workspace-panels.tsx`/`onDrafted`/`refreshToken` to confirm the
      deletion in T016–T018 left no dangling import.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Phase 1 (T001 informs T004's
      destination list) — BLOCKS all three user stories.
- **User Story 1 (Phase 3)**: depends on Foundational only; independently
      shippable as the MVP (dashboard + stats, even with old-shaped
      `/workspace` still combined — though Phase 4 is expected the same
      cycle per the ticket's acceptance criteria).
- **User Story 3 (Phase 4)**: depends on Foundational only; independent of
      Phase 3's dashboard content (does not read stats).
- **User Story 2 (Phase 5)**: depends on Foundational (sidebar) AND on
      Phase 3 (dashboard must exist to navigate to) AND Phase 4 (Trips/Media
      routes must exist to navigate to) — its full-traversal e2e is the
      integration point that proves Phases 2–4 compose correctly.
- **Polish (Phase 6)**: depends on all of the above.

### Parallel Opportunities

- T001/T002 (Setup) in parallel.
- T006 (CSS) in parallel with T004/T005 (component work) inside
      Foundational — different files.
- T012 (dashboard CSS) in parallel with T008–T011 — different files.
- T019/T020/T021 (independent e2e spec files) in parallel within Phase 4.
- T025 depends on the full route set existing, so it runs after Phase 3 and
      4 checkpoints, not in parallel with them.

## Implementation Strategy

### MVP First (User Story 1 only, on top of Foundational)

1. Complete Phase 1 + Phase 2 (shell + sidebar mechanism).
2. Complete Phase 3 (dashboard + stats).
3. **STOP and VALIDATE**: sign in, confirm `/dashboard` renders correctly for
   a zero-activity agency — this alone already answers the "typeform"
   complaint at the landing screen.
4. Continue to Phase 4 (route split) and Phase 5 (full sidebar reachability
   + Discover) to complete the ticket's full acceptance criteria — this
   feature is delivered as one PR (not staged across multiple), so all
   phases land together, but Phase 3's independent testability de-risks the
   highest-value slice first during implementation.
