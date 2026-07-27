# Tasks: Traveler group trips (spec 040)

Dependency-ordered. `[P]` = parallelizable with siblings.

## Phase 1 — Data model (additive, no schema bump)

- **T001** Create `packages/db/src/schema-group-trips.ts` with `travelerMembership`,
  `travelerGroup`, `travelerGroupMember`, `travelerGroupMessage` (per plan.md data
  model). Follow `schema-group-travel.ts`/`schema-consumer-planner.ts` conventions
  (uuid PK, `boolean`, FK to `user.id`/`itinerary.id`, indexes).
- **T002** Register the four tables in `packages/db/src/schema.ts` (re-export block +
  imports + `schema` object) and re-export from `packages/db/src/index.ts`.

## Phase 2 — Service layer

- **T003** Create `packages/api/src/services/group-trips.ts`: zod input schemas +
  `getMembership`, `verifyMembership`, `requireEligible`, `createGroup`, `joinGroup`,
  `listMyGroups`, `getGroup`, `postMessage`, `confirmMembership`, `finalizeGroup`,
  `cancelGroup`. Typed refusal values; reuse `resolveShareLinkTenant`, `attachTraveler`,
  `getUserIdentity`, `toClientItineraryView`. Finalize re-reads the confirmation set
  inside a `db.transaction`.

## Phase 3 — Router + wiring

- **T004** Create `packages/api/src/routers/group-trips.ts` (`groupTripsRouter`, all
  `protectedProcedure`). Map `not_found`→NOT_FOUND only where appropriate; keep
  business outcomes as values.
- **T005** Mount `groups: groupTripsRouter` in `packages/api/src/routers/client-view.ts`
  and export any needed types from `packages/api/src/index.ts`.

## Phase 4 — Web UI (`(client-view)/view/groups/`)

- **T006** `/view/groups/page.tsx` + client panel: My groups list, create-a-group
  (pick a My-Trip + name), membership/verify panel. [P]
- **T007** `/view/groups/[groupId]/page.tsx` + detail panel: roster + confirmation +
  in-group chat + confirm + organizer finalize/cancel (all-party gate surfaced). [P]
- **T008** `/view/groups/join/[token]/page.tsx` invite landing → join → redirect. [P]
- **T009** Add a "Groups" entry to the consumer side-nav (spec 037).

## Phase 5 — Tests

- **T010** L1/L2 unit tests: eligibility gate + all-confirmed finalize logic + typed
  refusals.
- **T011** L3 `packages/api/src/__tests__/l3-group-trips.test.ts` (real Postgres): full
  journey + negatives (SC-002 ineligible zero-rows, SC-003 finalize-gate conservation,
  SC-004 non-member/ non-organizer refusals, concurrent confirm-vs-finalize).

## Phase 6 — Live verification + gate

- **T012** `pnpm run lint` + `pnpm test` (in-image) green.
- **T013** Live Test & Fix (INV-027): boot built compose stack, browser journey with
  per-step screenshots + compose-log scan; fix defects in-cycle.
- **T014** UAT card `.kitchenloop/uat-cards/goal-group-trips.md` + zero-context
  evaluator.
- **T015** PR to `campaign/two-sided-surface` with spec-alignment table, Pre-Write
  decision, Live Test Evidence; `OPERATOR-DESK.md` row `GROUP-TRIPS-AMEND`.
