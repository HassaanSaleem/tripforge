# Tasks: Traveler Self-Drive Booking

**Feature**: `specs/036-traveler-self-book` | **Branch**: `kitchen/fix-goal-consumer-selfbook-selfdrive`

**Input**: plan.md, spec.md, research.md, data-model.md, contracts/self-book.md, quickstart.md

Money path — L3 with failure-conservation assertions is mandatory (constitution VI,
INV-011). No schema change; no new revenue-share/client-ownership row.

---

## Phase 1: Setup

- [ ] T001 Confirm the money-path facts the design depends on (read-only): `booking_quote` has a stable ordering column for "most recent markup" (`created_at`/`expires_at`/`id`) in `packages/db/src/schema-booking.ts`; `bookItinerary`/`quoteItinerary`/`loadItinerary` read only `session.agencyId` (+ `session.userId` in book) in `packages/api/src/services/booking/{book,quote,shared}.ts`.

## Phase 2: Foundational (blocking prerequisites)

- [ ] T002 Add `BookingActor = Pick<AgentSessionContext, "agencyId" | "userId">` in `packages/api/src/services/booking/actor.ts` (new); export it from the barrel `packages/api/src/services/booking.ts`.
- [ ] T003 Widen `loadItinerary(container, actor: BookingActor, itineraryId)` in `packages/api/src/services/booking/shared.ts` (was `AgentSessionContext`); no logic change.
- [ ] T004 Widen `quoteItinerary(container, actor: BookingActor, input)` in `packages/api/src/services/booking/quote.ts`; rename internal `session.agencyId` reads to `actor.agencyId`; no behavior change.
- [ ] T005 Widen `bookItinerary(container, actor: BookingActor, input)` in `packages/api/src/services/booking/book.ts`; `actor.agencyId` for tenant, `actor.userId` for `pmf_event.actor_user_id`; no behavior change.
- [ ] T006 Verify the agent path still compiles: `packages/api/src/routers/booking.ts` passes `ctx.session` (an `AgentSessionContext`, assignable to `BookingActor`) unchanged. Run `pnpm run lint` on `packages/api`.
- [ ] T007 Export `resolveShareLinkTenant(db, token) → { agencyId, itineraryId } | undefined` from `packages/api/src/services/client-view.ts` (promote the existing private `findShareLinkByToken`), so self-book resolves the owning agency in one place.

## Phase 3: User Story 1 — Traveler books the trip themselves (P1) 🎯 MVP

**Goal**: A signed-in traveler self-books a shared itinerary through the real money path, attributed to the owning agency.

**Independent test**: Sign in as a traveler, open a shared un-booked itinerary, confirm "Book it myself" → legs show Booked + trip total; DB has `booking`/`booking_component`/`markup_ledger` rows with the owning `agency_id` and traveler `actor_user_id`.

- [ ] T008 [US1] Add `selfBookItinerary(container, session, token)` orchestrator in `packages/api/src/services/booking/self-book.ts` (new): resolve token→`{agencyId, itineraryId}` (T007); build `actor = { agencyId, userId: session.userId }`; derive `markupBps` (latest `booking_quote.markup_bps` for the itinerary, else `1500`); `quoteItinerary` → held quote-row ids; if none → `{ status: "nothing_to_book" }`; else `bookItinerary`; map to redacted `SelfBookOutcome`.
- [ ] T009 [US1] Define + export `SelfBookOutcome`/`SelfBookLeg` types and the redacted projection (join `itemId`→document `title`/`kind`; map internal reason → client-safe enum; drop net/markup/MoR/supplier ids) in `self-book.ts`; re-export from `packages/api/src/services/booking.ts`.
- [ ] T010 [US1] Mount `clientView.selfBook` as `protectedProcedure` mutation (input `{ token: uuid }`) in `packages/api/src/routers/client-view.ts`, delegating to `selfBookItinerary(ctx.container, ctx.session, input.token)`.
- [ ] T011 [US1] Wire the trip-fork self-drive branch in `apps/web/app/(client-view)/view/[token]/trip-fork.tsx`: signed-in → review-then-confirm real self-book via `trpc.clientView.selfBook`; render confirmed/failed legs + trip total; anonymous → prompt to sign in (reuse existing sign-in link), no booking fires (FR-009).
- [ ] T012 [US1] Pass the client view's items (title/kind/sellMinor per bookable item) from `apps/web/app/(client-view)/view/[token]/page.tsx` into `TripFork` so the review screen lists the concrete sourced recommendations without a second fetch.

## Phase 4: User Story 2 — Nothing charged when a booking can't complete (P1)

**Goal**: State conservation on the failure branch — failed leg never charged; fully-failed writes nothing; at-most-once per item.

**Independent test**: L3 forces supplier failure(s) and asserts row deltas.

- [ ] T013 [US2] Add `l3-traveler-self-book.test.ts` in `packages/api/src/__tests__/`: reuse the `l3-booking` harness (`makeAgency`, `makeContainer`, `countsFor`, `appRouter.createCaller`). Happy path: agent drafts + shares an **un-booked** itinerary; a traveler caller self-books → assert `booking`/`booking_component`/`markup_ledger`/`pmf_event` deltas with owning `agency_id` + traveler `actor_user_id`; `markup = sell − net`.
- [ ] T014 [US2] In the same test, force one leg's supplier to fail (sandbox failure hook / already-consumed hold) → assert that leg has no component/ledger/event row, its hold is released, `totalChargedMinor` excludes it, other legs booked once. Force **all** legs to fail → assert zero new rows for the itinerary (all-fail conservation).
- [ ] T015 [US2] Add the `nothing_to_book` case (fully agent-booked itinerary → no new rows), the redaction assertion (payload has no `netMinor`/`markupBps`/`merchantOfRecord`/`supplierBookingId`/`offerId`), and the auth assertion (anonymous caller → `UNAUTHORIZED`). Narrow all indexed/destructured access explicitly (avoid the known `noUncheckedIndexedAccess` trap).

## Phase 5: User Story 3 — Concrete sourced recommendations & advisories (P2)

**Goal**: Review screen shows sourced items; honest flights; sourced-only advisories.

**Independent test**: Each recommendation matches a real itinerary item; flights are labeled indicative deep-links; advisory panel is labeled + source-linked, no fabricated facts.

- [ ] T016 [US3] In `trip-fork.tsx`, render the review "what you'll book" list from the passed-in items (title/kind/price) — recommendations trace to real supplier offers (FR-010).
- [ ] T017 [US3] Add a clearly-labeled "Before you book" panel: operator-confirmation notes derived from the traveler's own real components (e.g., transfer pickup) + an outbound link to authoritative official travel-advisory sources; **no fabricated destination facts** (FR-012). If flights are surfaced at all, reuse `apps/web/lib/flights.ts` labeled indicative only (FR-011). Add any small formatting helpers in `apps/web/lib/client-view.ts`.

## Phase 6: Polish & Cross-Cutting

- [ ] T018 Update the standing regression witness `scenarios/incubating/traveler-self-book-attempt/scenario.mjs`: arrange shares an **un-booked** proposal; assert `clientView.selfBook` **succeeds** (component count rises, owning agency, conservation) and the handoff still works; flip the `KITCHENLOOP-COVERAGE` annotation `booking × web × client` `fail → pass`.
- [ ] T019 Run `pnpm run lint` + `pnpm test` green; then the Live Test & Fix protocol (boot built compose stack, smoke + e2e, Playwright MCP browser journey per quickstart §3 with screenshots to `.kitchenloop/evidence/8/goal-consumer-selfbook/`, compose-log scan).
- [ ] T020 Update `.kitchenloop/coverage-matrix.yaml` cell `booking × web × client` → `pass` with the new scenario as witness (re-read the file immediately before editing — shared across phases).

---

## Dependencies

- Phase 2 (T002–T007) blocks everything (the type widening + tenant resolver).
- US1 (T008–T012) is the MVP; depends on Phase 2.
- US2 (T013–T015) depends on US1 (tests the procedure).
- US3 (T016–T017) depends on US1's UI (T011/T012).
- Polish (T018–T020) after US1+US2 green.

## Parallel opportunities

- T002/T007 are independent files → parallelizable.
- T011/T012 (UI) can proceed in parallel with T013–T015 (L3 tests) once T008–T010 land.

## MVP scope

**US1 alone** (T002–T012) delivers a working traveler self-book. US2 is the
mandatory money-path conservation gate; US3 is the trust/UX polish.
