---

description: "Task list for demo-09-request-agent (022-request-agent-fork)"
---

# Tasks: Self-drive vs. request-an-agent fork on the client trip view

**Input**: Design documents from `/specs/022-request-agent-fork/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/request-agent-fork.md, quickstart.md

**Tests**: INCLUDED. This touches a new integration point (new router procedures + a new
table), so an L3 test against real Postgres is mandatory per the quality bar — it is not a
money path, so no concurrency/conservation treatment is required (unlike demo-11-group-travel).
Following the established convention (`l3-group-travel.test.ts`, `l3-client-view.test.ts`):
one L3 file covers all user stories' state-delta/tenant-scoping behavior; no separate unit-test
file is added for the zod input schema alone (declarative, exercised implicitly by the L3
rejection cases).

**Organization**: Tasks are grouped by user story (spec.md priorities P1-P3) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US3)

## Path Conventions

Monorepo (pnpm + turborepo): `packages/db`, `packages/api`, `apps/web` — per plan.md's
Project Structure section. No new package.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Nothing new to initialize — this feature extends existing packages/apps with
their established tooling (tsconfig, vitest, eslint already configured repo-wide).

- [X] T001 Confirm `pnpm test`/`pnpm run lint` run clean on `origin/main` baseline before
  starting (sanity check, no new tooling needed)

**Checkpoint**: No blocking setup — proceed directly to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The new table every user story's flows read/write. MUST complete before any
user story implementation.

- [X] T002 Create `packages/db/src/schema-trip-handoffs.ts` with the `trip_handoff_request`
  table (id uuid PK defaultRandom, itinerary_id via `itineraryFk()` cascade, agency_id via
  `agencyFk()`, contact_name text NOT NULL, contact_email text NULL, notes text NULL, status
  text NOT NULL closed enum `new | accepted`, created_at timestamp defaultNow) and a composite
  index on `(agency_id, created_at)` per data-model.md
- [X] T003 Assemble `schema-trip-handoffs.ts` into `packages/db/src/schema.ts` (import +
  re-export + `schema` object entry, matching the `schema-group-travel.ts` assembly pattern)
  and export `tripHandoffRequest` from `packages/db/src/index.ts`
- [X] T004 Run `drizzle-kit push` (or the repo's existing migration-apply command) against the
  local/compose Postgres to materialize the new table — confirm via `\d trip_handoff_request`
  in psql

**Checkpoint**: Schema ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Client asks an agent to arrange the trip (Priority: P1) 🎯 MVP

**Goal**: A traveler on `/view/[token]` chooses "Have an agent arrange this for me," submits
name/email/notes, and a `trip_handoff_request` row is created with the itinerary's CURRENT
owning agency and `status = new`.

**Independent Test**: Submit the request-agent form on a shared trip view; verify a
`trip_handoff_request` row exists with the submitted contact info, `status = 'new'`, and
`agency_id` equal to the itinerary's owning agency. An unknown/invalid token is refused with
no row created.

### Tests for User Story 1

- [X] T005 [US1] Create `packages/api/src/__tests__/l3-trip-handoffs.test.ts` with the US1
  walk against real Postgres: valid token + name-only submit → row created (`status='new'`,
  correct `agency_id`, `contact_email IS NULL`); valid token + name+email+notes → all fields
  persisted; missing `contactName` → zod parse rejection, no row created; unknown/invalid
  token → `{status: "not_found"}`, no row created (mirrors `resolveShareLink`'s existing
  not-found precedent, contracts §1)

### Implementation for User Story 1

- [X] T006 [US1] Add `submitTripHandoffRequest` + its zod input schema to
  `packages/api/src/services/trip-handoffs.ts` (NEW file): resolves the itinerary via the
  same `itinerary_share_link` lookup `resolveShareLink` uses, reads that itinerary's current
  `agency_id`, inserts one row with `status = 'new'`, returns
  `{status: "submitted", requestId}` or `{status: "not_found"}` (contracts §1, research D1/D4)
- [X] T007 [US1] Add the `requestHandoff` public mutation to
  `packages/api/src/routers/client-view.ts` (contracts §1)
- [X] T008 [P] [US1] Export `SubmitTripHandoffOutcome` (and any other newly-nameable outcome
  type) from `packages/api/src/index.ts`, mirroring the `client-view.ts` types block (TS4023)
- [X] T009 [US1] Create `apps/web/app/(client-view)/view/[token]/trip-fork.tsx` (client
  component): renders the two-choice fork; wire only the "Have an agent arrange this for me"
  branch in this story (reveals the name/email/notes form, calls
  `clientView.requestHandoff`, shows a success confirmation on `submitted`, a neutral message
  on `not_found`). Must render inside the `(client-view)` route group only (INV-020) and
  import no workspace/agent-facing component
- [X] T010 [US1] Render `<TripFork>` below `ClientItineraryView` in
  `apps/web/app/(client-view)/view/[token]/page.tsx`

**Checkpoint**: A traveler can submit a request-agent handoff and it lands in Postgres with
the correct owning agency. (Not yet visible to the agent — that's US2.)

---

## Phase 4: User Story 2 - Agent sees and accepts the request (Priority: P2)

**Goal**: The agent workspace has a "Trip requests" inbox listing only the signed-in agent's
own agency's requests, and an agent can mark one `accepted` (idempotently).

**Independent Test**: Seed one `trip_handoff_request` row for agency A (directly, or via US1);
sign in as agency A, open the inbox, confirm it's visible; accept it, confirm `status` becomes
`accepted`; confirm agency B's session never sees agency A's request.

### Tests for User Story 2

- [X] T011 [US2] Extend `l3-trip-handoffs.test.ts` (T005's file): tenant-scoped `list` shows
  only the signed-in agency's own rows, newest-first; `accept` transitions `new → accepted`
  (state-delta assertion); a second `accept` call on the same id is idempotent (still returns
  `{status: "accepted", requestId}`, no error); `accept`/`list` for a DIFFERENT agency's
  request/id never returns it / throws `NOT_FOUND` (INV-004, contracts §2/§3)

### Implementation for User Story 2

- [X] T012 [US2] Add `listTripHandoffRequests` (tenant-scoped, `WHERE agency_id = ?`,
  newest-first) and `acceptTripHandoffRequest` (tenant-scoped, idempotent UPDATE) to
  `packages/api/src/services/trip-handoffs.ts` (contracts §2/§3, research D3)
- [X] T013 [US2] Create `packages/api/src/routers/trip-handoffs.ts` (`tripHandoffsRouter`):
  `list` (agentProcedure query) and `accept` (agentProcedure mutation, throws `NOT_FOUND` on a
  cross-tenant/missing id) — mirrors `group-travel.ts`'s `requireDb`/thin-adapter shape
  (contracts §2/§3)
- [X] T014 [US2] Register `tripHandoffs: tripHandoffsRouter` in
  `packages/api/src/routers/workspace.ts`, alongside `groupTravel`
- [X] T015 [P] [US2] Create `apps/web/app/(workspace)/workspace/trip-handoffs-panel.tsx`
  (client component): loads `trpc.workspace.tripHandoffs.list.query()` on mount, renders a
  list with contact name/email/notes/linked-trip title/status badge + a single "Accept"
  button per `new` row — mirrors `itinerary-list.tsx`'s loading/empty/loaded +
  status-badge + single-action-button shape (NOT the heavier `group-travel-panel.tsx` layout)
- [X] T016 [US2] Add a "Trip Requests" nav destination to `apps/web/lib/nav.ts` (confirm the
  label is not a substring of, and does not contain, any existing label — "Trips" is already
  used, and "Trip Requests" does not contain it as a contiguous substring) and mount
  `<TripHandoffsPanel>` at its route, following the spec-017 dashboard-app-shell sidebar
  convention

**Checkpoint**: An agent can see and accept incoming requests, scoped strictly to their own
agency. The full request-agent path (client → DB → agent inbox → accept) is now demoable
end-to-end.

---

## Phase 5: User Story 3 - Client chooses to book it themselves (Priority: P3)

**Goal**: The "Book it myself" fork choice shows a clear confirmation with zero persisted
state — no `trip_handoff_request` row, no dead ends.

**Independent Test**: Select "Book it myself" on a shared trip view; confirm a clear
acknowledgement message renders with no broken navigation, and confirm (via Postgres) that no
`trip_handoff_request` row was created by this interaction.

### Tests for User Story 3

- [X] T017 [P] [US3] Playwright e2e assertion in the new e2e spec (T019) that selecting
  "Book it myself" shows the confirmation message and creates no `trip_handoff_request` row
  (query count before/after, or assert via a stubbed network-request check that no
  `requestHandoff` call fired)

### Implementation for User Story 3

- [X] T018 [US3] Add the "Book it myself" branch to `trip-fork.tsx` (T009's file): selecting it
  shows a confirmation message inline, with no server call and no shared state with the
  request-agent branch

**Checkpoint**: Both fork choices are complete and independently correct.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] Playwright e2e spec `tests/e2e/trip-handoffs-journey.spec.ts`: full journey —
  open a shared trip view, choose "Book it myself" (confirm stub + no row), reload, choose
  "Have an agent arrange this for me," submit, sign in as the owning agent, see the request in
  the "Trip Requests" inbox, accept it, confirm status updates without a full reload; a second
  agency's inbox never shows it
- [X] T020 [P] Run `pnpm run lint` and fix any findings across all new/edited files
- [X] T021 [P] Run `pnpm test` (full root suite) — confirm zero regressions in existing
  client-view/workspace suites alongside the new tests
- [X] T022 Run quickstart.md end-to-end against the built compose stack (INV-027 Live Test —
  see kitchenloop-execute SKILL.md step 4e for the full protocol); capture screenshots to
  `.kitchenloop/evidence/<iteration>/demo-09-request-agent/`
- [ ] T023 Write the sealed UAT test card to `.kitchenloop/uat-cards/demo-09-request-agent.md`
  per the UAT Gate protocol

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (the table must
  exist before any service function can write to it).
- **User Story 1 (Phase 3)**: Depends on Foundational only. MVP — ships independently
  (a request lands in Postgres even before the agent-side inbox exists).
- **User Story 2 (Phase 4)**: Depends on Foundational + US1 (needs a `trip_handoff_request`
  row-producing path to have something to list/accept, though its own service functions are
  additive exports and could technically be tested against a directly-seeded row first).
- **User Story 3 (Phase 5)**: Depends on Foundational only for correctness, but shares
  `trip-fork.tsx` (T009) with US1 — implemented after US1 to avoid a merge/edit conflict on
  the same file.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T008 (index.ts type export) can run parallel to T007 (router mutation) once T006 (service)
  lands — different files.
- T015 (UI panel) is parallel to T012-T014 (service/router) within Phase 4 — different
  files/layers.
- T020/T021 (lint/test) in Polish can run in parallel; T017/T019 (e2e) can be drafted in
  parallel with T020/T021.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (trivial) + Phase 2 (Foundational — schema).
2. Complete Phase 3 (US1 — client submits a request).
3. **STOP and VALIDATE**: submit a request via the tRPC surface, confirm the row in Postgres
   carries the correct `agency_id`.

### Incremental Delivery

1. Foundational → Phase 3 (US1, submit) → validate.
2. Phase 4 (US2, inbox + accept) → validate tenant scoping FIRST (the cross-tenant refusal
   assertion) before moving to UI polish.
3. Phase 5 (US3, self-drive stub) → validate no row is created.
4. Phase 6 (Polish, Live Test, UAT card).

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- T011's tenant-scoping/idempotency assertions are the single most important test in this
  feature — INV-004 is the one invariant a lead-capture feature like this can still get wrong.
  Do not mark User Story 2 complete without it passing against real Postgres.
- Commit after each task or logical group.
