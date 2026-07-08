# Tasks: Supply Adapter Port Family + Sandbox Mocks

**Input**: Design documents from `/specs/003-supply-adapter-ports/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/supply-ports.md, quickstart.md

**Tests**: INCLUDED — the reusable L2 contract suite IS a deliverable of this
feature (FR-007/FR-008), not optional TDD ceremony.

**Organization**: grouped by user story (US1–US4 from spec.md) so each story is
an independently verifiable increment. All paths are repo-relative.

## Phase 1: Setup

- [x] T001 Establish the in-image verification oracle for this branch: `docker build --target build -t tripforge-verify -f apps/web/Dockerfile .` then `docker run --rm tripforge-verify pnpm test` — confirms the pre-change baseline (51 tests) is green in the loop runtime where host pnpm is denied (research D1 constraint; quickstart §1). No file changes.

## Phase 2: Foundational (blocking ALL user stories)

- [x] T002 Create the shared port vocabulary in packages/supply-adapter/src/ports/common.ts: `MerchantOfRecord`, `SupplyContent`, `QuoteFailureReason`/`BookFailureReason`/`CancelFailureReason`, `QuoteOutcome<TQuote>`, `SupplyBooking`, `BookingOutcome`, `CancelOutcome`, `OfferBase`, `QuoteBase`, and the generic `SupplyPort<TCriteria, TOffer, TQuote>` — exactly the shapes in contracts/supply-ports.md. Money imported from `@tripforge/domain` (no new deps).
- [x] T003 Create the deterministic sandbox lifecycle engine in packages/supply-adapter/src/sandbox/engine.ts (internal, NOT exported from index.ts): known-offer registry, quote issuance with per-component hold window + injectable clock, expiry check (`now < expiresAt`, boundary exclusive), idempotent booking record (first outcome replayed), cancel transitions (cancelled/already_cancelled/unknown_booking), pre-seeded `SANDBOX_FAIL_BOOK_OFFER_ID` fixture that quotes normally and always books to `failed(supplier_rejected)`, counter-derived deterministic ids. Per data-model.md "State transitions" + research D3–D6.

**Checkpoint**: `docker run --rm tripforge-verify pnpm run typecheck` compiles (engine has no consumers yet — orphan warning acceptable until T008–T011 wire it; do not export it to silence the check).

## Phase 3: User Story 1 — Book any P0 component through one uniform contract (P1) 🎯 MVP

**Goal**: search → quote → book → cancel for hotel, activity, transfer, car
rental through supplier-agnostic ports; composition root exposes all four.

**Independent test**: the shared contract suite instantiated per component
passes its uniform-journey assertions (contract items 1–3, 6, 8 of
contracts/supply-ports.md) for 4/4 sandboxes; `buildContainer()` returns all
four ports.

- [x] T004 [P] [US1] Upgrade packages/supply-adapter/src/ports/hotel.ts in place: `HotelOffer` gains `content: SupplyContent` (drop `name`), `HotelQuote` gains `merchantOfRecord`, `HotelPort` extends `SupplyPort<HotelSearchCriteria, HotelOffer, HotelQuote>`, DELETE `HotelBooking` (superseded by `BookingOutcome` — deletion discipline, no v1-beside-v2). Criteria unchanged.
- [x] T005 [P] [US1] Create packages/supply-adapter/src/ports/activity.ts: `ActivitySearchCriteria { destination; date?; participants }`, `ActivityOffer = OfferBase & { durationMinutes? }`, `ActivityQuote = QuoteBase`, `ActivityPort` (per data-model.md).
- [x] T006 [P] [US1] Create packages/supply-adapter/src/ports/transfer.ts: `TransferSearchCriteria { from; to; at; passengers }`, `TransferOffer = OfferBase & { mode: "private" | "shared" }`, `TransferQuote = QuoteBase`, `TransferPort`.
- [x] T007 [P] [US1] Create packages/supply-adapter/src/ports/car-rental.ts: `CarRentalSearchCriteria { pickupLocation; dropoffLocation?; pickupAt; dropoffAt; driverAge? }`, `CarRentalOffer = OfferBase & { vehicleClass }`, `CarRentalQuote = QuoteBase`, `CarRentalPort`. Boundary-comment that itinerary-item linkage is deferred per D-006 (FR-012).
- [x] T008 [P] [US1] Rewrite packages/supply-adapter/src/sandbox/hotel.ts onto the engine: deterministic USD fixtures (keep the two seed-0001 offers' prices), 15-min hold, MoR `agency`, injectable clock preserved.
- [x] T009 [P] [US1] Create packages/supply-adapter/src/sandbox/activity.ts: EUR fixtures, 30-min hold, MoR `supplier` (multi-currency proof, research D11).
- [x] T010 [P] [US1] Create packages/supply-adapter/src/sandbox/transfer.ts: USD fixtures, 10-min hold, MoR `supplier`.
- [x] T011 [P] [US1] Create packages/supply-adapter/src/sandbox/car-rental.ts: EUR fixtures, 20-min hold, MoR `supplier`.
- [x] T012 [US1] Update packages/supply-adapter/src/index.ts public surface: export all common vocabulary types, the four port type families, the four sandbox adapters, and `SANDBOX_FAIL_BOOK_OFFER_ID`; remove the deleted `HotelBooking` export. Engine stays internal.
- [x] T013 [US1] Create the reusable behavioral contract suite in packages/supply-adapter/src/__tests__/contract-suite.ts: exported `describeSupplyPortContract(name, harness)` (harness = `{ makePort(clock), searchCriteria }`) covering contract items 1–3, 6, 8 (uniform journey, typed unknown-offer/unknown-quote/cancel outcomes, explicit currency). NOT a `*.test.ts` file.
- [x] T014 [P] [US1] Create the four instantiation files: packages/supply-adapter/src/__tests__/hotel.contract.test.ts, activity.contract.test.ts, transfer.contract.test.ts, car-rental.contract.test.ts — each < ~30 lines: build harness with fake clock + criteria, call `describeSupplyPortContract`.
- [x] T015 [US1] Wire the composition root: packages/api/src/context.ts `Container` gains `activity: ActivityPort; transfer: TransferPort; carRental: CarRentalPort`; packages/api/src/container.ts `buildContainer` constructs the three new sandbox adapters (FR-011). `buildContainer()` is the only Container literal in the repo (verified in plan) — no other callsites.
- [x] T016 [US1] Checkpoint: rebuild `tripforge-verify` image and run `pnpm test` in-image — 4 × contract suite green + existing 51 tests green.

## Phase 4: User Story 2 — An expired price can never book silently (P1)

**Goal**: expiry enforced at book time; re-quote path; idempotent booking.

**Independent test**: contract items 4–5 pass per component with a fake clock.

- [x] T017 [US2] Extend packages/supply-adapter/src/__tests__/contract-suite.ts with expiry + idempotency sections: (a) advance fake clock to exactly `expiresAt` → book fails `quote_expired`, no booking created; (b) re-quote same offer → fresh quoteId + strictly later expiry, books fine; (c) book same quote twice → identical recorded outcome, exactly one booking (contract items 4–5; INV-006).
- [x] T018 [US2] Checkpoint: in-image `pnpm test` — expiry sections green for 4/4 components (engine from T003 should already satisfy; fix engine if red — never weaken the assertion).

## Phase 5: User Story 3 — One component's failure never destroys the cart (P2)

**Goal**: typed booking failure + hold independence, deterministically simulable.

**Independent test**: contract item 7 per component; two-port cart simulation
(contract items 9–10) passes.

- [x] T019 [US3] Extend packages/supply-adapter/src/__tests__/contract-suite.ts with the failure-fixture section: quote `SANDBOX_FAIL_BOOK_OFFER_ID` → quoted; book it → `failed(supplier_rejected)` (contract item 7).
- [x] T020 [US3] Create packages/supply-adapter/src/__tests__/partial-failure.test.ts: hotel (USD) + activity (EUR) cart simulation — quote both, book the fail-fixture activity → failed(supplier_rejected), then book the hotel quote within its hold → confirmed; assert currencies untouched end-to-end (contract items 9–10; INV-007/INV-009 port guarantees).
- [x] T021 [US3] Checkpoint: in-image `pnpm test` green.

## Phase 6: User Story 4 — Swapping a supplier touches nothing outside the adapter (P2)

**Goal**: machine-verifiable boundary: same suite for any implementation; zero
supplier shapes outside the package.

**Independent test**: quickstart §2 audits return clean.

- [x] T022 [P] [US4] Run the supplier-shape leak audit (quickstart §2 grep across apps/packages/tests) — expect zero matches; record output for the PR's Live Test Evidence section (SC-004).
- [x] T023 [P] [US4] Run `docker run --rm tripforge-verify pnpm run depcruise` — INV-017 boundaries clean, no new orphans (engine is imported by sandboxes; contract-suite.ts is under __tests__, excluded).

## Phase 7: Polish & Cross-Cutting

- [x] T024 Verify canonical schema untouched: `git diff origin/main -- packages/itinerary-schema` is empty (SC-006, FR-012).
- [x] T025 In-image `pnpm run lint` clean + full `pnpm test` final run; record counts for the PR body.
- [x] T026 Live gate (INV-027, quickstart §4): `docker compose down -v && docker compose up --build --wait` (composition root is in the boot path) → `node tests/integration/smoke.mjs` 5/5 → `docker compose logs --no-color` captured to `.kitchenloop/evidence/iter-3/seed-0003/compose.log` and scanned (`ERROR|FATAL|Unhandled`, empty allowlist) → `docker compose down -v`. No browser journey (no UI-facing change — record the carve-out in the PR body).
- [x] T027 File the follow-up backlog ticket for static supplier-content materialization (Postgres derived tables with semantic keys + MediaRef enrichment, INV-025/026, research D8) via the local ticket helper into .kitchenloop/backlog.json; reference it from the PR body.

## Dependencies & Execution Order

- Phase 1 (T001) → Phase 2 (T002 → T003) → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7.
- Within Phase 3: T004–T007 [P] (ports, independent files) and, after them, T008–T011 [P] (sandboxes; need their port + engine). T012 needs T004–T011. T013 needs T002 (types) and is best after T012. T014 needs T012+T013. T015 needs T012. T016 last.
- US2/US3 suite extensions (T017, T019) are sequential edits to the same file — not [P] with each other.
- US4 audits (T022, T023) are [P] with each other; need all code final.

## Parallel Example (Phase 3)

```
# After T003:
T004 ports/hotel.ts | T005 ports/activity.ts | T006 ports/transfer.ts | T007 ports/car-rental.ts
# then:
T008 sandbox/hotel.ts | T009 sandbox/activity.ts | T010 sandbox/transfer.ts | T011 sandbox/car-rental.ts
```

## Implementation Strategy

MVP = Phases 1–3 (US1): uniform bookable contract + wiring, contract suite
happy paths. US2 (expiry — also P1) completes the money-correctness story and
ships in the same PR. US3/US4 are the cart-readiness and boundary-proof
increments. Everything lands in ONE PR (kitchenloop execute, ticket
seed-0003); checkpoints are in-image because host pnpm is denied in the loop
runtime (research D1).
