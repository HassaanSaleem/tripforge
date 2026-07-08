# Tasks: Budget Allocator + Quote-Then-Book Flow

**Input**: Design documents from `/specs/005-budget-quote-book/`
**Prerequisites**: plan.md, research.md (D1–D10), data-model.md, contracts/planner-and-booking.md, quickstart.md

**Tests**: REQUIRED by the quality bar — money paths need L1 exhaustive + L2 caller + L3 state-delta coverage (Constitution VI); test tasks are therefore included per story.

**Organization**: grouped by user story (US1 draft, US2 quote+book, US3 partial failure, US4 rebalance, US5 PMF) so each story lands as an independently testable increment.

## Phase 1: Setup (manifests + lockfile — blocking everything)

- [X] T001 Add workspace/manifest deps with matching lockfile edits (research D3/D4): `packages/api/package.json` += `@tripforge/domain`, `@tripforge/itinerary-schema` (workspace:\*), `zod ^4.4.3`; `packages/llm/package.json` += `@tripforge/supply-adapter` (workspace:\*, type-only usage), `zod ^4.4.3`. Try `pnpm install --lockfile-only`; if denied, hand-edit `pnpm-lock.yaml` importers (links + existing zod@4.4.3). Verify with `docker build --target deps .` (frozen-lockfile must pass).

## Phase 2: Foundational (blocking prerequisites for all stories)

- [X] T002 [P] Extend `packages/domain/src/money.ts` with `splitByWeightsMinorUnits` (largest-remainder, conservation), `applyMarkupBps`, `convertMoney` + `ExchangeRate` type (research D9); export via `packages/domain/src/index.ts`.
- [X] T003 [P] Add the five agency-scoped tables (`itinerary`, `booking_quote`, `booking`, `booking_component`, `markup_ledger`) to `packages/db/src/schema.ts` exactly per data-model.md; export via `packages/db/src/index.ts`.
- [X] T004 Extend `packages/domain/src/__tests__/money.test.ts` with exhaustive branch coverage for the three new functions (conservation property across weight profiles, rounding half-up cases, currency-mismatch throws, bps=0/negative validation).
- [X] T005 Extend `tests/integration/harness.mjs` `WATCHED_TABLES` with the five new tables (money-path seeds extend this list per its doc comment).

**Checkpoint**: `pnpm --filter @tripforge/domain test` green; schema compiles; foundation ready.

## Phase 3: User Story 1 — Describe a trip, get a budget-fit, live-priced draft (P1) 🎯 MVP

**Goal**: `workspace.itinerary.draft` returns a persisted canonical itinerary, budget-allocated and priced from sandbox supply, deterministic with FakeLLM (no key).

**Independent Test**: caller test drafts against sandbox ports + FakeLLM; asserts canonical validation, allocation conservation, offer traceability, untouched flights reserve.

- [X] T006 [P] [US1] Create `packages/domain/src/budget.ts`: `allocateBudget` (trip-type band profiles 40/35/12/7/6 default via `splitByWeightsMinorUnits`; flightsTransport reserve marker; `budget_below_reserve`/`no_days` infeasibility outcomes); export via index.
- [X] T007 [P] [US1] Create `packages/llm/src/planner-draft.ts`: zod (v4) `PlannerDraftSchema` per data-model.md draft vocabulary (offer refs + hints only) + inferred `PlannerDraft` type.
- [X] T008 [US1] Extend `packages/llm/src/port.ts`: `PlannerTripRequest`, `PlannerToolDeps` (type-only imports of port criteria/offer types from `@tripforge/supply-adapter` — research D7), `DraftItineraryRequest` (purpose + request + tools), `DraftItineraryResult` union; add `draftItinerary` to `LLMPort`; export via index.
- [X] T009 [P] [US1] Create the five tool files in `packages/llm/src/tools/` (INV-013, one per file): `search-hotel-rates.ts`, `search-activities.ts`, `quote-transfer.ts`, `quote-car-rental.ts` (betaZodTool factories over injected executors; zod input schemas mirroring port criteria; compact offer serialization) and `submit-itinerary-draft.ts` (PlannerDraftSchema input; captures the draft — research D2).
- [X] T010 [US1] Extend `packages/llm/src/fake.ts`: deterministic `draftItinerary` (invokes injected tools, proposes per-day cheapest-fit hotel + activities + arrival/departure transfers, one stay spanning the trip; scriptable `scriptedDrafts` for malformed/hallucinated/fail-book injections).
- [X] T011 [US1] Extend `packages/llm/src/anthropic.ts`: `draftItinerary` via `client.beta.messages.toolRunner` on `claude-haiku-4-5` (max_iterations ≤ 6, no effort param), four lookup tools + submit tool, metering via onUsage (purpose), typed `planner_failed` outcomes on exhaustion/malformed.
- [X] T012 [P] [US1] Create `packages/domain/src/assemble.ts`: `assembleItinerary(request, draft, verifiedOffers, allocations, rates)` → canonical `Itinerary` (items re-priced from offers, per-day subtotals, pricing block with spent per category, category fit flags; drop unknown offers; hard-cap never exceeded); validated by `ItinerarySchema` in tests; export via index.
- [X] T013 [US1] Create `packages/api/src/rates.ts` (`STATIC_RATES` EUR↔USD 108/100 as `ExchangeRate[]`) and extend `packages/api/src/context.ts` + `container.ts` with `rates` (research D8).
- [X] T014 [US1] Create `packages/api/src/services/planner.ts`: allocate → `llm.draftItinerary` (executors closing over container ports, Promise.all fan-out) → re-verify offers by re-running searches → `assembleItinerary` → `parseItinerary` → one tx: insert `itinerary` row (document + trip_request) + `recordPmfEvent` trip_created(self_built); typed `infeasible`/`planner_failed` outcomes with zero writes.
- [X] T015 [US1] Create `packages/api/src/routers/itinerary.ts` (`workspace.itinerary.draft` mutation + `workspace.itinerary.get` query per contracts §1–2, zod-parse-function inputs, tenant-scoped reads) and mount in `packages/api/src/routers/workspace.ts`.
- [X] T016 [US1] Extend `apps/web/lib/trpc/server.ts`: module-scope singleton container (research D6) — one `buildContainer({db})` per process, reused across requests.
- [X] T017 [US1] Tests: extend `packages/domain/src/__tests__/` with `budget.test.ts` + `assemble.test.ts` (allocation conservation property, reserve untouched, under-fill flag, unknown-offer drop, single-currency output); add `packages/llm/src/__tests__/planner.test.ts` (fake draft determinism, submit-tool zod rejection of malformed drafts, tool factory schemas); add `packages/api/src/__tests__/draft-flow.test.ts` (caller: draft happy path with sandbox+fake — canonical validation, allocations sum, trip_created event recorded via fake executor; RBAC: anon UNAUTHORIZED, traveler FORBIDDEN).
- [X] T018 [US1] Extend `tests/integration/smoke.mjs`: agent bootstrap (sign-up → Better Auth organization create → session with active org) + draft walk with exact deltas (`itinerary +1`, `pmf_event +1`, others conserved) and response assertions (allocations sum to budget, items carry supplyRef).

**Checkpoint**: US1 fully functional on the compose stack with zero keys — the MVP.

## Phase 4: User Story 2 — Quote then book with markup (P1)

**Goal**: `workspace.booking.quote` + `workspace.booking.book` — holds with expiry, explicit conversion, pure markup, transactional reservation + ledger writes.

**Independent Test**: caller test quotes + books a drafted itinerary against sandbox ports; asserts hold fields, sell−net=markup, one reservation + one ledger row per confirmed component in one tx.

- [X] T019 [US2] Create `packages/api/src/services/booking.ts` (quote half): load itinerary tenant-scoped → re-register supply (re-run searches from trip_request — research D6) → per item `port.quote(offerId)` → `convertMoney` (record rate) + `applyMarkupBps` → insert `booking_quote` rows; per-item typed failures (`unknown_offer`/`no_rate`/`already_booked`) never abort siblings (contracts §3).
- [X] T020 [US2] Add book half to `packages/api/src/services/booking.ts`: validate rows (tenant, itinerary, unconsumed, unexpired server-side) → `port.book(supplierQuoteId)` per component → ONE tx for confirmed components: `booking` + `booking_component` + `markup_ledger` (markup = sell − net) + `booking_confirmed` PMF events + `consumed_at`; typed per-component failures; all-fail → zero writes (contracts §4).
- [X] T021 [US2] Create `packages/api/src/routers/booking.ts` (`workspace.booking.quote`, `workspace.booking.book`) and mount in `workspace.ts`; extend `workspace.itinerary.get` to include quote/booking summaries.
- [X] T022 [US2] Extend `packages/api/src/__tests__/` with `booking-flow.test.ts` (caller: quote fields incl. conversion transparency on EUR items; book happy path row shapes + ledger equality; double-book same rows → `already_consumed` + no new rows; RBAC + cross-tenant NOT_FOUND on all four new procedures).
- [X] T023 [US2] Extend `tests/integration/smoke.mjs`: quote walk (`booking_quote +N`, hold fields present) → book walk (`booking +1`, `booking_component +N`, `markup_ledger +N`, `pmf_event +N`, sell−net=markup via psql check) → double-book negative (typed failure, zero delta).

**Checkpoint**: full describe→plan→quote→book money path live on the compose stack.

## Phase 5: User Story 3 — One component's failure never destroys the cart (P2)

**Goal**: per-component partial-failure semantics proven against real Postgres, incl. conservation on the failure branch.

**Independent Test**: env-gated L3 suite runs against compose Postgres via the built image on the stack network.

- [X] T024 [US3] Create `packages/api/src/__tests__/l3-booking.test.ts` (vitest, `describe.skipIf(!process.env.DATABASE_URL)`; tRPC caller + drizzle against real Postgres; controllable sandbox clocks + scripted FakeLLM): (a) cart with `SANDBOX_FAIL_BOOK_OFFER_ID` → siblings confirm, failed component zero rows; (b) all-fail → zero delta anywhere; (c) expired quote (clock advance past hold) → `quote_expired`, conservation, re-quote then book succeeds; (d) hallucinated offerId in scripted draft → dropped at verification (SC-002).
- [X] T025 [US3] Run T024 in-cycle per quickstart §4 (`docker run --network <stack> -e DATABASE_URL=… tripforge-verify pnpm --filter @tripforge/api test`) and capture output as live-test evidence.

**Checkpoint**: Constitution VI failure-branch conservation witnessed against a real DB.

## Phase 6: User Story 4 — Re-balance when a category runs over (P2)

**Goal**: buffer-first, reserve-protected re-balancing with exact integer moves.

**Independent Test**: pure-function tests over demand profiles; assembly integration shows moved allocations.

- [X] T026 [US4] Add `rebalanceAllocations(allocations, demands)` to `packages/domain/src/budget.ts` (buffer first, then proportional under-consumed donors, never flightsTransport, never below consumed, hard-cap total invariant; returns move list) and integrate into `assembleItinerary`/planner service so draft responses carry `fit.rebalances`.
- [X] T027 [US4] Extend `packages/domain/src/__tests__/budget.test.ts`: donor ordering, exact-amount moves, reserve-protection, infeasible-even-after-rebalance → underFilled flag, conservation property post-rebalance; extend `draft-flow.test.ts` with one over-budget-category scenario asserting visible rebalance.

## Phase 7: User Story 5 — Plan→book conversion measurable (P3)

**Goal**: PMF events pinned to their transactions; plan→book view computes from this flow.

- [X] T028 [US5] Extend `packages/api/src/__tests__/booking-flow.test.ts` + `l3-booking.test.ts`: trip_created written atomically with draft (failed draft → no event); booking_confirmed only for confirmed components with sell amounts; extend `tests/integration/smoke.mjs` with a `pmf_plan_to_book` view query proving non-zero conversion from this flow's events (SC-007).

## Phase 8: Polish & Cross-Cutting

- [X] T029 [P] Run full gates: `pnpm run lint`, `pnpm test`, `tsc --noEmit` per touched package, `depcruise` (INV-017 clean incl. the type-only llm→supply-adapter edge), knip/jscpd — in-image if host installs stay denied.
- [X] T030 [P] Execute quickstart end-to-end (compose build/boot, smoke, env-gated L3, log scan, teardown) and archive evidence to `.kitchenloop/evidence/iter-3/seed-0005/` (INV-027).
- [X] T031 Record the INV-028 streaming deferral follow-up in the PR body (Complexity Tracking item); the loop files it as a backlog ticket on the iteration branch (not this feature branch — backlog.json is control-plane state).

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 (Phase 3) → US2 (Phase 4) → US3 (Phase 5) → US4/US5 (parallel-capable) → Polish.
- US2 depends on US1 (books what draft produced). US3 depends on US2 (exercises its failure branches). US4 touches only domain + planner response (independent of US2/3 once US1 lands). US5 asserts events created in US1/US2.
- [P] markers: T002∥T003; T006∥T007∥T009∥T012 (different packages/files); T029∥T030.

## Implementation Strategy

MVP = Phase 1–3 (US1). Then US2 completes the money path (the ticket's core), US3 proves the failure branches (review-blocking without it), US4/US5 finish spec coverage. Each checkpoint leaves the repo green and shippable.

## Phase 9: PR #13 Review Rework (tickets seed-0005a/b/c, 2026-07-08)

**Goal**: fix the three money-path findings from the PR #13 two-model review
(pr-auditor + codex + operator verification) in one rework pass.

- [X] T032 [seed-0005a] Add research D11 (book-time hold re-establishment
      with exact-price reconciliation) and update plan.md summary,
      data-model.md (`consumed_at` atomicity, `supplier_quote_id` update on
      consume, `quote_row_id` UNIQUE migration note), contracts §4, and
      spec.md FR-009 (fresh-process bookability + at-most-once consumption).
- [X] T033 [seed-0005a] `packages/api/src/services/booking.ts`: on
      `unknown_quote` for a live hold, lazily re-register supply state
      (`verifiedSupplyCatalog`), re-quote the offer, reconcile net
      price/currency/MoR against the persisted row, book the re-established
      supplier quote; mismatch → `quote_expired` with both prices logged.
- [X] T034 [seed-0005b] Dedupe `quoteRowIds` (first-occurrence order);
      restructure the booking transaction to consume-first-atomically
      (`WHERE consumed_at IS NULL` + `.returning()`, recording the supplier
      quote actually booked) and write booking/component/ledger/PMF rows for
      consume winners only; race losers re-typed `already_consumed`.
- [X] T035 [seed-0005b] `packages/db/src/schema.ts`: UNIQUE on
      `booking_component.quote_row_id` (backstop; applied via the compose
      migrate stage's `drizzle-kit push`); export `isNull` from
      `packages/db` for the atomic-consume predicate.
- [X] T036 [seed-0005c] `packages/domain/src/money.ts`: add pure `markupOf`
      (same-currency + non-negative ledger identity, composes
      `subtractMoney`); use it for the `markup_ledger` write; L1 tests.
- [X] T037 [seed-0005a/b] Extend `l3-booking.test.ts`: (a) fresh-container
      book WITHOUT re-quote succeeds with exact deltas (the Vercel
      quote→book sequence the original suite missed); (b) duplicate ids in
      one request record money exactly once; (c) two concurrent book
      requests → exactly one winner, one set of rows, conserved money.

## Phase 10: PR #13 Merge-Prep Fixes (Stage 4a codex findings, 2026-07-08)

**Goal**: fix the two blocking findings from the merge pipeline's external
alignment review (codex) — expired-row serving and the llm package boundary.

- [X] T038 `packages/api/src/services/booking.ts`: `itineraryOverview` serves
      active + consumed quote rows only — an expired unconsumed row is never
      served and can only trigger a re-quote (spec quote lifecycle;
      contract §2). L3 expired-hold test extended: expired unconsumed rows
      absent from `itinerary.get`; consumed rows stay visible after booking.
- [X] T039 `packages/llm/package.json`: `@tripforge/supply-adapter` moved from
      dependencies to devDependencies — the plan's architecture exception is
      type-only coupling (every import is `import type`, erased at build);
      lockfile updated via `pnpm install --lockfile-only`.

## Phase 11: PR #13 Final-Tribunal Fix (seed-0005d, 2026-07-08)

**Goal**: money-path conservation under concurrency — no supplier booking
may survive unrecorded (FR-009/FR-011/INV-011; research D12).

- [X] T040 [seed-0005d] `packages/api/src/services/booking.ts`: reserve-then-
      book — a claim transaction (id-ordered locking read + atomic
      `consumed_at` flip) runs BEFORE `port.book`; a supplier failure
      releases the claim; a recording-transaction failure compensates with
      `port.cancel` + claim release before surfacing the fault.
- [X] T041 [seed-0005d] `packages/supply-adapter` sandbox: read-only
      `liveBookingIds()` inspection on the engine + the four adapters — the
      supplier-side witness for conservation tests (not a SupplyPort verb).
- [X] T042 [seed-0005d] `l3-booking.test.ts`: (a) two concurrent fresh-process
      books of one cart → one winner, loser all `already_consumed`, DB rows
      exactly once, and the suppliers hold exactly ONE live booking per hold
      (red on book-first, green on reserve-then-book); (b) injected
      recording-tx failure → zero live supplier bookings, all claims
      released, zero money rows.
- [X] T043 [seed-0005d] `tests/integration/uat-fresh-process.mjs` `book-race`
      mode: two concurrent live books of the saved holds → exactly one
      confirmed, loser refused per component. contracts §4 + research
      D11/D12 + plan updated in the same pass.
