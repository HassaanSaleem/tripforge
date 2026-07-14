---
description: "Task list for Demo Seed Data (specs/017-demo-seed-data)"
---

# Tasks: Demo Seed Data

**Input**: Design documents from `/specs/017-demo-seed-data/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: One unit test is included for the curated-catalog lookup helper
(a pure function, per plan.md's Testing section). The seed script itself is
verified live (INV-027) per the quality bar, not unit-tested — same class as
the existing `vet-agency.mjs`/`apply-views.mjs` operator scripts.

**Organization**: Tasks are grouped by user story (US1/US2/US3 map to
spec.md's three prioritized stories).

## Phase 1: Setup

- [X] T001 Add `tsx` as a devDependency of `apps/web/package.json` and add a
  `"db:seed": "tsx scripts/seed-demo.ts"` script; regenerate the lockfile
  entry (`pnpm install --lockfile-only` — dockerized per the repo's install
  policy).
- [X] T002 [P] Add `"scripts/*.ts"` to the `apps/web` workspace's `entry`
  array in `knip.json` so the new seed script isn't flagged as an unused
  file.
- [X] T003 [P] Add `^apps/web/scripts/` to the `no-orphans` rule's
  `pathNot` array in `.dependency-cruiser.cjs` (mirrors the existing
  `^packages/db/scripts/` exemption, same "operator/CLI actions — entered
  via node" rationale).
- [X] T004 Create the `apps/web/scripts/` directory with a skeleton
  `seed-demo.ts` (imports only, a `main()` stub, and the
  `main().catch(...)`/exit-code contract from contracts/seed-script.md) so
  later tasks can incrementally fill it in.

**Checkpoint**: `pnpm --filter @tripforge/web run db:seed` runs (no-op body) without a module-resolution error.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared type extension both US1 (seeded content quality) and
US2 (curated catalog) build on.

- [X] T005 Add optional `imageUrl?: string` and `attribution?: string`
  fields to `SupplyContent` in `packages/supply-adapter/src/ports/common.ts`
  (per data-model.md's Extended type section — additive only, no Zod, no
  breaking change).

**Checkpoint**: `packages/supply-adapter` type-checks; every existing sandbox fixture (which omits the two new fields) still compiles.

---

## Phase 3: User Story 1 - Operator boots a populated demo, not an empty shell (Priority: P1) 🎯 MVP

**Goal**: A fresh boot produces vetted agencies, sign-in-capable demo users,
6+ drafted itineraries with visible budget breakdowns, and at least one trip
with attached media — idempotently.

**Independent Test**: `docker compose down -v && docker compose up --build
--wait`; sign in with a documented demo login; see populated trips. Re-run
without `-v`; counts are unchanged (quickstart.md steps 1, 2, 6).

### Implementation for User Story 1

- [X] T006 [US1] In `apps/web/scripts/seed-demo.ts`, implement
  `ensureAgency(db, {name, slug})`: check `organization` by slug, insert if
  absent, return the agency id (data-model.md's Idempotency Keys —
  deterministic slug per demo agency).
- [X] T007 [US1] In the same file, implement `ensureDemoUser(auth, db,
  {agencyId, name, email, password, role})`: call
  `auth.api.signUpEmail({body: {name, email, password}})` (research.md D1),
  treat an "already exists" response as already-seeded, then
  `ensureMembership(db, {agencyId, userId, role})` (direct insert into
  `member`, matching `packages/api/src/__tests__/l3-marketplace.test.ts`'s
  `makeAgency` pattern) and `ensureVetted(db, agencyId)` (direct insert into
  `agency_vetting`, mirroring `packages/db/scripts/vet-agency.mjs`'s
  ON-CONFLICT-DO-NOTHING idempotency).
- [X] T008 [US1] Define the 4-5 demo agencies + their 1-2 users each as a
  plain data literal in `seed-demo.ts` (or a co-located
  `apps/web/scripts/seed-fixtures.ts` if the literal grows large) —
  recognizable names (e.g. "Azure Travel Co", "Meridian DMC", "Lisbon &
  Co", "Kaido Journeys"), deterministic slugs/emails, and a fixed demo
  password; wire T006/T007 to create all of them.
- [X] T009 [US1] Implement `buildDemoContainer()`: call `buildContainer({db})`
  from `@tripforge/api` ONCE for the whole script run (defaults `llm` to
  `FakeLLM` per research.md D3) and `sessionFor(agencyId, userId)` returning
  `{userId, agencyId, agencyRole: "owner"}`.
- [X] T010 [US1] Implement `drainDraft(caller, input)` in `seed-demo.ts`: a
  small local `for await` loop over `caller.workspace.itinerary.draft(input)`
  that returns the terminal `{type: "result"}` event's outcome (research.md
  D3 — same shape as the test-only `draft-helper.ts`, reimplemented locally
  since production/ops code shouldn't import from `__tests__/`).
- [X] T011 [US1] Implement `ensureSeededItinerary(caller, agencySlug,
  destination, checkIn, checkOut)`: check `workspace.itinerary.list` for an
  existing itinerary titled with the `"[demo] "` prefix for that destination
  (data-model.md's Idempotency Keys — itineraries have no built-in
  "already exists" outcome); if absent, call `drainDraft` with a `hardCap`
  budget sized per research.md D7 (tune the exact `amountMinor` against the
  curated prices once T017/T018 land) and `tripStyle: "balanced"`.
- [X] T012 [US1] Wire 6+ `ensureSeededItinerary` calls spread across the
  demo agencies and the four hero destinations (FR-003), logging each
  outcome per contracts/seed-script.md's Output contract.
- [X] T013 [US1] Implement the media step: for at least one seeded
  itinerary, call `workspace.media.register` (a licensed-stock URL +
  attribution) then `workspace.itinerary.attachMedia` (gallery scope) via
  the owning agency's caller (FR-004).
- [X] T014 [US1] Wire the Docker boot sequence: append
  `&& pnpm --filter @tripforge/web run db:seed` to the migrate-stage `CMD`
  in `apps/web/Dockerfile` AND to the `migrate` service's command override
  in `docker-compose.yml` (research.md D6 — both must match; the compose
  file's `migrate` service builds from the same Dockerfile target so review
  for drift between the two).
- [X] T015 [US1] Add the final summary log line (`"seed-demo: done — N
  agencies, ..."` per contracts/seed-script.md) and the top-level
  `main().catch()` handler that exits non-zero only on a genuine
  (non-"already") failure.

**Checkpoint**: `docker compose down -v && docker compose up --build --wait` produces vetted agencies, sign-in-capable users, and 6+ itineraries with budget breakdowns; a second `docker compose up --build --wait` (no `-v`) changes nothing.

---

## Phase 4: User Story 2 - A trip in a hero city looks like a real trip, not a fixture (Priority: P2)

**Goal**: Drafting for Lisbon/Tokyo/Marrakech/Reykjavik returns realistic,
distinct, licensed-photo-backed content; every other destination is
unaffected.

**Independent Test**: Draft a trip for a curated city vs. a non-curated city
and compare item names (quickstart.md steps 5, 7).

### Tests for User Story 2

- [X] T016 [P] [US2] Unit test `lookupCuratedCity` in
  `packages/supply-adapter/src/sandbox/__tests__/curated-catalog.test.ts`:
  known cities (any casing/whitespace) resolve, unknown destinations return
  `undefined`, and every curated offer entry has both `imageUrl` AND
  `attribution` set (contracts/curated-catalog.md's "always sets BOTH
  together" rule).

### Implementation for User Story 2

- [X] T017 [US2] Create `packages/supply-adapter/src/sandbox/curated-catalog.ts`
  (data-model.md's New module section): `CURATED_CITIES` keyed by
  `lisbon`/`tokyo`/`marrakech`/`reykjavik`, each with 3-4 hotels (USD),
  4-5 activities (EUR), and transfer outbound+return pairs (USD) —
  realistic names/descriptions/licensed Unsplash-or-Pexels `imageUrl` +
  `attribution` per contracts/curated-catalog.md's Data requirements; export
  `lookupCuratedCity(destination)`.
- [X] T018 [US2] Wire `SandboxHotelAdapter.search()` and
  `SandboxActivityAdapter.search()` in `packages/supply-adapter/src/sandbox/
  {hotel,activity}.ts` to call `lookupCuratedCity(criteria.destination)`
  first and return the curated hotels/activities (via `engine.register`)
  when matched, falling back to the existing procedural generation
  unchanged otherwise (contracts/curated-catalog.md's Contract, points 1-2).
- [X] T019 [US2] Wire `SandboxTransferAdapter.search()` in
  `packages/supply-adapter/src/sandbox/transfer.ts` to call
  `lookupCuratedCity` against `criteria.to` (falling back to `criteria.from`)
  and return the curated outbound+return transfer pairs when matched, same
  fallback rule.

**Checkpoint**: A live draft for "Lisbon" shows curated item names; a live draft for "Paris" is byte-identical to pre-feature behavior.

---

## Phase 5: User Story 3 - A seller agency has evidence of marketplace income (Priority: P3)

**Goal**: At least 3 marketplace listings, 3+ completed licenses, and 3+
ratings exist, so at least one seller's earnings are non-zero.

**Independent Test**: Browse the marketplace and see 3+ listings with
ratings; sign in as a licensed seller and see non-zero earnings
(quickstart.md steps 3, 4).

### Implementation for User Story 3

- [X] T020 [US3] Implement `ensureListing(caller, itineraryId, {title,
  priceMinor, currency, licenseTerms, revenueShareBps})` in
  `seed-demo.ts`: call `workspace.marketplace.createListing`, treat
  `already_listed` as success (data-model.md — listings are idempotent by
  construction).
- [X] T021 [US3] Wire `ensureListing` for 3+ of the seeded itineraries from
  T012, owned by their seller agencies, with realistic prices and a stated
  `revenueShareBps` (FR-005).
- [X] T022 [US3] Implement `ensureLicense(resellerCaller, listingId)`: call
  `workspace.marketplace.licenseListing`, treat `already_licensed` as
  success; wire at least 3 completed licenses across the seeded listings
  from DIFFERENT reseller agencies/listing pairs (FR-006; spec.md's note
  that rating requires being a licensee — need 3+ distinct (listing,
  agency) pairs, not just 1, to get 3 independent ratings).
- [X] T023 [US3] Implement `ensureRating(resellerCaller, listingId, {stars,
  comment})`: call `workspace.marketplace.rateListing` (upsert, always
  safe to re-call) for each licensed pair from T022, with a short comment
  (FR-007).
- [X] T024 [US3] Extend the seed script's final summary log line (T015) to
  include listing/license/rating counts.

**Checkpoint**: The marketplace browse view shows 3+ active listings with ratings; the seller-earnings surface shows a non-zero amount for at least one agency.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Run `pnpm run lint` and `pnpm test` (L1/L2) — the new
  `curated-catalog.test.ts` (T016) must pass; no existing test regresses.
- [ ] T026 Live Test & Fix (INV-027): `docker compose down -v && docker
  compose up --build --wait`, run `node tests/integration/smoke.mjs` +
  `npx playwright test`, then drive quickstart.md's steps 1-7 in a real
  browser via Playwright MCP, screenshotting each step to
  `.kitchenloop/evidence/5/demo-01-seed/`; scan compose logs for
  non-allowlisted `ERROR|FATAL|Unhandled` lines.
- [ ] T027 Document every seeded demo login (agency name, email, password)
  in the PR body per contracts/seed-script.md's Output contract.
- [ ] T028 Write and freeze the UAT card at
  `.kitchenloop/uat-cards/demo-01-seed.md` per the UAT gate protocol
  (browser steps mirroring quickstart.md steps 2-5, exact expected text,
  no placeholders).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup (the skeleton script file
  from T004 exists, though T005 itself only touches `packages/supply-adapter`
  and has no real code dependency on T001-T004 — kept in sequence for
  reviewability).
- **User Story 1 (Phase 3)**: Depends on Foundational. Independently
  deliverable — produces a populated demo even before curated content (US2)
  or marketplace transactions (US3) land, using today's procedural supply
  content and 0 listings.
- **User Story 2 (Phase 4)**: Depends on Foundational (T005) only — NOT on
  Phase 3. Can be implemented and verified in parallel with Phase 3.
- **User Story 3 (Phase 5)**: Depends on Phase 3 (T012's seeded itineraries
  must exist before they can be listed) — sequential, not parallel, with
  Phase 3.
- **Polish (Phase 6)**: Depends on Phases 3, 4, and 5 all being complete
  (the live/UAT verification exercises the full seeded demo, including
  curated content and marketplace transactions).

### Parallel Opportunities

- T002 and T003 (knip/depcruise config) can run in parallel with each other
  and with T001.
- Phase 4 (US2, curated catalog) can be implemented in parallel with Phase
  3 (US1, seed script skeleton) once Phase 2 (T005) lands — they touch
  disjoint files (`packages/supply-adapter/` vs `apps/web/scripts/`) — but
  Phase 3's `ensureSeededItinerary` calls (T011-T012) should land AFTER
  Phase 4 so the seeded itineraries pick up curated content on the first
  real run rather than needing a second re-seed pass.
- T016 (the curated-catalog unit test) can be written in parallel with
  T017 (the module it tests), though in practice writing T017 first and
  T016 immediately after is simpler for a fixture-heavy data module.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1) — this alone already satisfies the ticket's core
   complaint (empty platform on boot) using today's procedural supply
   content.
3. **STOP and VALIDATE** via quickstart.md steps 1, 2, 6.

### Incremental Delivery (this ticket ships all three in one PR)

Given the batching policy (this is a single feature-sized ticket, one
branch, one PR — not a multi-PR rollout), Phases 3, 4, and 5 are all
implemented together before the PR opens; the phase split above exists so
each story's independent test can be checked off distinctly during
implementation and in the PR body's spec-alignment table, not so they ship
as separate PRs.
