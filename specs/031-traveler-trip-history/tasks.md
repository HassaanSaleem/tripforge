---

description: "Task list for Traveler Trip History — My Trips"
---

# Tasks: Traveler Trip History — "My Trips"

**Input**: Design documents from `/specs/031-traveler-trip-history/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/traveler-trip-history.md, quickstart.md

**Tests**: Included — `.kitchenloop/unbeatable-tests.md` requires L3 integration tests for
integration points; this feature adds a new tRPC surface + DB table, so L3 is mandatory, not
optional.

**Organization**: Tasks are grouped by user story (spec.md P1/P2/P1) to enable independent
implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Monorepo (per plan.md Project Structure): `packages/db/src/`, `packages/api/src/`, `apps/web/`,
`tests/e2e/`.

---

## Phase 1: Setup (Schema)

**Purpose**: The one new table, additive/backfill-free, no canonical schema change.

- [x] T001 Add `clientTripLink` table to `packages/db/src/schema-itinerary.ts` per
      data-model.md (uuid PK, `userId` text FK → `user.id` cascade, `itineraryId` via
      `itineraryFk()`, `source` text not null, `createdAt` timestamp; `UNIQUE(userId, itineraryId)`
      + index on `(userId, createdAt)`)
- [x] T002 Export `clientTripLink` from `packages/db/src/schema.ts` (add to both the named
      re-export list and the `schema` object)
- [x] T003 Export `clientTripLink` from `packages/db/src/index.ts`

**Checkpoint**: `pnpm --filter @tripforge/db typecheck` passes; `client_trip_link` appears in
`drizzle-kit push` output against a scratch DB (verified in Phase 6 quickstart run, not here).

---

## Phase 2: Foundational (Service + Router — blocks all user stories)

**Purpose**: The `attachTraveler`/`listTravelerTrips` service functions and the two new
`clientView` procedures every user story's UI/tests call.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 In `packages/api/src/services/client-view.ts`, factor the existing inline
      `itinerary_share_link` token lookup out of `resolveShareLink` into a private
      `findShareLinkByToken(db, token)` helper (returns the raw link row or `undefined`); update
      `resolveShareLink` to call it — zero behavior change to `resolveShareLink`'s existing return
      shape or tests
- [x] T005 In `packages/api/src/services/client-view.ts`, add
      `export type AttachTravelerOutcome = { status: "not_found" } | { status: "linked" }` and
      `attachTraveler(container, session: SessionContext, token: string)`: uses
      `findShareLinkByToken`, then `INSERT INTO client_trip_link ... ON CONFLICT (user_id,
      itinerary_id) DO NOTHING` with `source: "view"` (depends on T004, T001-T003)
- [x] T006 In `packages/api/src/services/client-view.ts`, add
      `export interface TravelerTripSummary { token, title, agencyName, currency,
      totalSellMinor, linkedAt }` and `listTravelerTrips(container, userId)`: selects
      `client_trip_link` joined to `itinerary_share_link` by `itineraryId`, ordered by
      `client_trip_link.createdAt DESC`, then calls the EXISTING unmodified `resolveShareLink` per
      row and projects `found` results only (depends on T001-T003)
- [x] T007 [P] In `packages/api/src/routers/client-view.ts`, add
      `attachTrip: protectedProcedure.input(getInputSchema).mutation(({ctx, input}) =>
      attachTraveler(ctx.container, ctx.session, input.token))` (depends on T005)
- [x] T008 [P] In `packages/api/src/routers/client-view.ts`, add
      `myTrips: protectedProcedure.query(({ctx}) => listTravelerTrips(ctx.container,
      ctx.session.userId))` (depends on T006)
- [x] T009 Export `TravelerTripSummary` from `packages/api/src/index.ts` (TS4023 convention,
      mirrors `TravelerIdentity`)

**Checkpoint**: `pnpm --filter @tripforge/api typecheck` passes; `clientView.attachTrip`/
`clientView.myTrips` are callable via `appRouter.createCaller`.

---

## Phase 3: User Story 1 - A returning traveler finds their trips again (Priority: P1) 🎯 MVP

**Goal**: A signed-in traveler can open "My Trips" and see every trip they've previously viewed,
each opening the real branded client-view.

**Independent Test**: Sign in, open two shared trips, open "My Trips", confirm both listed and
each opens correctly (quickstart.md steps 4-6).

### Tests for User Story 1

- [x] T010 [P] [US1] L3: `attachTrip` on a known token creates exactly one `client_trip_link` row
      and returns `{status: "linked"}`; on an unknown token returns `{status: "not_found"}`; on no
      session throws `UNAUTHORIZED` — new file
      `packages/api/src/__tests__/l3-traveler-trip-history.test.ts`
- [x] T011 [P] [US1] L3 (same file): after `attachTrip`, `myTrips` for that traveler returns the
      trip with correct `title`/`agencyName`/`currency`/`totalSellMinor` matching
      `resolveShareLink`'s own output for the same token
- [ ] T012 [P] [US1] e2e: sign in as a traveler, open a shared trip, open "My Trips" via the
      account-strip link, confirm the trip is listed, select it, confirm it lands on the same
      `/view/<token>` page — new file `tests/e2e/traveler-trip-history-journey.spec.ts`

### Implementation for User Story 1

- [x] T013 [US1] In `apps/web/app/(client-view)/view/[token]/page.tsx`, change `resolveIdentity`
      to accept `token` and, after a successful `clientView.me()` call, best-effort call
      `caller.clientView.attachTrip({token})` in ITS OWN try/catch (never affects the returned
      identity — plan.md Constraints); update the call site to `resolveIdentity(token)`
- [x] T014 [US1] In `apps/web/app/(client-view)/view/[token]/trip-fork.tsx`, add a "My Trips" link
      (`href="/view/my-trips"`, `data-testid="my-trips-link"`) inside the existing `identity ? (...)`
      branch of the account strip, next to the sign-out control
- [x] T015 [US1] Create `apps/web/app/(client-view)/view/my-trips/page.tsx` (server component,
      static segment — resolves ahead of `/view/[token]`): `getSessionContext` → redirect to
      `/view/sign-in` if none; else `getAuthenticatedCaller(headers).clientView.myTrips()` and
      render a list (title, agency name, total if priced, link to `/view/${token}`); brand-neutral
      shell matching `/view/sign-in`'s `tf-client-root`/`tf-auth-shell` classes
- [x] T016 [US1] ~~In `apps/web/lib/trpc/client.ts`, export `ClientViewMyTripsOutput` via
      inference~~ — SKIPPED, not needed: `/view/my-trips/page.tsx` is a server component
      consuming the in-process caller's inferred return type directly, the SAME pattern spec 030
      actually used for `TravelerIdentity` (a directly-exported type from `packages/api/src/index.ts`,
      T009) rather than a `client.ts` inference export — `client.ts` inference types are only
      needed by BROWSER `trpc.*` client-component call sites, which this feature has none of

**Checkpoint**: User Story 1 fully functional — sign in, view trips, see them in "My Trips", open
them.

---

## Phase 4: User Story 2 - A trip only appears after it's been viewed (Priority: P2)

**Goal**: Prove the attach-on-view boundary is exact — no premature entries, no duplicate entries,
no cross-traveler leakage.

**Independent Test**: quickstart.md steps 7-8 and 10 (repeat-view dedup, cross-traveler isolation).

### Tests for User Story 2

- [x] T017 [P] [US2] L3 (`l3-traveler-trip-history.test.ts`): a trip never attached for a given
      traveler is ABSENT from that traveler's `myTrips`, even when the same itinerary has been
      attached for a DIFFERENT traveler
- [x] T018 [P] [US2] L3 (same file): calling `attachTrip` on the same token twice for the same
      session produces exactly ONE row (query `client_trip_link` directly) and `myTrips` lists the
      trip exactly once
- [x] T019 [P] [US2] L3 (same file): two travelers who each attach a different, non-overlapping
      set of trips each see EXACTLY their own set from `myTrips` — cross-traveler isolation
      (FR-005), no shared-agency leakage either
- [ ] T020 [US2] e2e (`traveler-trip-history-journey.spec.ts`): sign in as traveler A, view trip
      #1 only; sign in as traveler B, view trip #2 only; confirm each traveler's "My Trips" shows
      only their own trip

### Implementation for User Story 2

No new production code — User Story 2 is a correctness property of the Phase 2 implementation
(the `UNIQUE(userId, itineraryId)` constraint + `onConflictDoNothing` for dedup, the
`WHERE client_trip_link.user_id = ctx.session.userId` predicate for isolation). This phase is
tests-only, proving those guarantees hold.

**Checkpoint**: Attach-on-view boundary is proven exact by automated tests.

---

## Phase 5: User Story 3 - Anonymous and existing behavior are unaffected (Priority: P1)

**Goal**: Zero regression to spec 010/022/030's anonymous and signed-in-identity behavior.

**Independent Test**: quickstart.md step 3 (anonymous view unaffected) and step 9 (signed-out
`/view/my-trips` redirect).

### Tests for User Story 3

- [x] T021 [P] [US3] L3 (`l3-traveler-trip-history.test.ts`): anonymous `clientView.itinerary` +
      `clientView.requestHandoff` remain byte-identical to their pre-feature behavior (reuse the
      same assertions as `l3-traveler-accounts.test.ts`'s regression test, confirming this feature
      adds nothing to the anonymous path)
- [x] T022 [P] [US3] L3 (same file): anonymous `clientView.attachTrip` and `clientView.myTrips`
      both throw `UNAUTHORIZED`
- [x] T023 [P] [US3] L3 (same file): `myTrips` payload negative-check — serialized JSON never
      contains `netMinor`/`markup`/agency member ids/tenant ids, only the same client-facing shape
      `resolveShareLink` already allows (INV-020, extends spec 030's existing negative-check
      pattern)
- [ ] T024 [US3] e2e (`traveler-trip-history-journey.spec.ts`): a signed-out visitor who opens a
      shared trip sees NO "My Trips" link in the account strip; navigating directly to
      `/view/my-trips` signed out redirects to `/view/sign-in`

### Implementation for User Story 3

No new production code — the isolated try/catch in T013 and the `protectedProcedure` gate on both
new procedures (T007/T008) are what this phase's tests verify. If T021/T022 fail, the fix belongs
in T005/T006/T013, not a new file.

**Checkpoint**: All three user stories independently proven; zero regressions to spec 010/022/030.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Gate compliance and evidence.

- [x] T025 `pnpm run lint` clean across `packages/db`, `packages/api`, `apps/web`
- [x] T026 `pnpm test` full suite green (L1/L2 + L3 when `DATABASE_URL` set)
- [ ] T027 Run quickstart.md end-to-end against the built compose stack (INV-027 Live Test & Fix);
      capture screenshots per step into `.kitchenloop/evidence/<iteration>/p2-consumer-trip-history/`;
      scan compose logs for non-allowlisted errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 — delivers the MVP (list + open)
- **User Story 2 (Phase 4)**: Depends on Phase 2 (same code as US1); can run its tests in parallel
  with Phase 3's tests once Phase 2 lands, but its e2e (T020) is easiest to write after T013-T015
  exist
- **User Story 3 (Phase 5)**: Depends on Phase 2 (T005/T006/T007/T008) and T013 (isolated
  try/catch); independent of Phase 3/4's UI tasks
- **Polish (Phase 6)**: Depends on all of the above

### Parallel Opportunities

- T001-T003 are sequential (same file family, small edits) — no [P] needed, but fast
- T007/T008 [P] — different procedures, same file, additive edits, no conflict in practice but
  keep as one commit to avoid merge noise
- T010/T011/T012 [P] — different test files/describe blocks
- T017/T018/T019 [P] — same file, independent `it()` blocks, safe to author in one pass
- T021/T022/T023 [P] — same file, independent `it()` blocks

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (schema) → Phase 2 (service + router) → Phase 3 (US1: page, link, attach wiring)
2. **STOP and VALIDATE**: quickstart.md steps 1-6
3. Phases 4-5 add the correctness/regression proof before the PR ships (both are test-only, no
   new production code, so they're cheap to complete before opening the PR rather than deferring)

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → independently testable MVP (list + open trips)
3. US2 → proves the boundary is exact (tests only)
4. US3 → proves zero regression (tests only)
5. Polish → lint/test/Live Test evidence for the PR
