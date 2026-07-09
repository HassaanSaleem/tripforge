# Tasks: Marketplace v0 — list, license/white-label, ratings, revenue-share plumbing

**Input**: Design documents from `/specs/006-marketplace-v0/` (plan.md, spec.md,
research.md, data-model.md, contracts/marketplace.md, quickstart.md)

**Tests**: REQUIRED — this is a money path (Constitution VI / quality bar
Money-Safe): L3 integration tests with state-conservation assertions on the
failure branch are release gates, not optional.

**Organization**: by user story (US1 listing, US2 license/white-label, US3
ratings) after shared foundations. Money/event/table shapes come from
data-model.md; outcomes from contracts/marketplace.md; decisions D1–D9 from
research.md.

## Phase 1: Setup

- [X] T001 Scaffold `packages/marketplace` (package.json with deps `@tripforge/{db,domain,itinerary-schema,shared}` + zod, tsconfig.json matching sibling packages, empty `src/index.ts`) and verify the workspace/turbo/depcruise toolchain sees it (`pnpm -r list` includes it; no depcruise rule violations).

## Phase 2: Foundational (blocking prerequisites for all stories)

- [X] T002 [P] Add pure `splitTakeRate(price: Money, takeRateBps: number)` to `packages/domain/src/money.ts` (floor take, exact conservation `price = take + credit`, bps 0–10000 validation, `MoneyError` on violations — research D5) and export it from `packages/domain/src/index.ts`.
- [X] T003 [P] L1 tests for `splitTakeRate` in `packages/domain/src/__tests__/money.test.ts`: conservation property across rounding cases, 0 bps, 10000 bps, sub-minor-unit remainder goes to seller, invalid bps/non-integer inputs throw.
- [X] T004 [P] Add the five tables from data-model.md to `packages/db/src/schema.ts` (`agency_vetting`, `marketplace_listing` incl. partial unique active-listing index [D9], `marketplace_license` incl. `UNIQUE(listing_id, reseller_agency_id)`, `revenue_share_ledger` incl. `UNIQUE(license_id)`, `listing_rating` incl. `UNIQUE(listing_id, rater_agency_id)`), add them to the `schema` export map, and re-export from `packages/db/src/index.ts`.
- [X] T005 [P] Extend the PMF event vocabulary in `packages/db/src/pmf-events.ts` with no-money types `listing_created` and `listing_rated` (both require `agencyId` + `itineraryId`; reject money/source fields — research D4), and extend the existing validation-matrix L1 tests in `packages/db/src/__tests__/` for both types.
- [X] T006 [P] Operator vetting action `packages/db/scripts/vet-agency.mjs`: resolve agency by slug or id against `DATABASE_URL`, idempotent insert into `agency_vetting` with `vetted_by` note, loud output of resulting state (contracts §6).
- [X] T007 `isVetted(db, agencyId)` in `packages/marketplace/src/vetting.ts` (+ export): true iff an `agency_vetting` row exists.

**Checkpoint**: `pnpm test` green (new L1s included) — user stories can start.

## Phase 3: User Story 1 — Seller lists a finished itinerary (P1)

**Goal**: vetted agency lists an owned itinerary with license terms; unvetted/unowned/duplicate refusals; browse; deactivate.

**Independent test**: vet one agency, list an owned itinerary, second agency sees it in browse; unvetted attempt refused (spec US1 scenarios 1–5).

- [X] T008 [US1] Implement `packages/marketplace/src/listings.ts`: zod input schemas + `createListing` (one tx: tenant-scoped owner load, `parseItinerary`, `stampProvenance`, `ListedItinerarySchema` gate → typed `provenance_incomplete`, persist stamped document to the source row, insert listing, `recordPmfEvent(listing_created)` — research D8; typed outcomes `listed | not_vetted | already_listed | provenance_incomplete` per contracts §1), `browseListings` (cross-tenant active-only public projection with rating aggregate placeholders — research D7, contracts §2), `deactivateListing` (seller-scoped, `deactivated | already_inactive` — contracts §3). Export from `src/index.ts`.
- [X] T009 [US1] L1/L2 tests in `packages/marketplace/src/__tests__/listings.test.ts`: input schema bounds (price ≥ 0, bps 0–10000, title/terms lengths), typed-outcome mapping for the pure/parseable branches (provenance-incomplete detection against a minimal fixture document).
- [X] T010 [US1] Thin router `packages/api/src/routers/marketplace.ts` exposing `createListing`/`browseListings`/`deactivateListing` via `agentProcedure` (booking-router precedent: zod parse, typed outcomes as values, `NOT_FOUND` throws), mounted as `marketplace` in `packages/api/src/routers/workspace.ts`.
- [X] T011 [US1] L3 slice in `packages/api/src/__tests__/l3-marketplace.test.ts` (env-gated on `DATABASE_URL`, l3-booking harness conventions): seed two agencies + users, vet seller; list → `listed` and source document now carries stamped provenance; unvetted → `not_vetted`; unowned itinerary → `NOT_FOUND`; second active listing → `already_listed`; browse from the other agency shows the listing; deactivate → excluded from browse.

**Checkpoint**: US1 independently deliverable (supply exists, gate enforced).

## Phase 4: User Story 2 — Reseller licenses and white-labels (P2)

**Goal**: atomic license transaction — license + ledger split + provenance-stamped copy + PMF events; all refusals; conservation under failure and concurrency.

**Independent test**: with one active listing, a second vetted agency licenses it → copy + exact split recorded together or not at all (spec US2 scenarios 1–6).

- [X] T012 [US2] Pure white-label transform in `packages/marketplace/src/white-label.ts`: `whiteLabelCopy(source, { copyId, resellerAgencyId, licenseTerms, revenueShareBps, sourceItineraryRowId })` → canonical document with re-homed `agencyId`/`id`, ORIGINAL author preserved (first author wins across resale chains), terms/bps stamped, `rebrandLineage` extended (data-model.md "Canonical itinerary schema"). L1 tests in `packages/marketplace/src/__tests__/white-label.test.ts` incl. a two-hop resale chain.
- [X] T013 [US2] Implement `packages/marketplace/src/licensing.ts` `licenseListing` (research D8, contracts §4): one tx — `SELECT … FOR UPDATE` listing; checks (active / reseller vetted / not self); insert license (unique-violation catch → typed `already_licensed`); `splitTakeRate` at `DEFAULT_PLATFORM_TAKE_RATE_BPS = 1000` (named constant in `packages/marketplace/src/config.ts`, D-0006.b); insert `revenue_share_ledger` row; insert copy itinerary row (whiteLabelCopy document + inherited `trip_request`); `recordPmfEvent(take_rate_accrued → seller)` + `recordPmfEvent(trip_created source=licensed → reseller)`; typed outcomes per contracts §4. Export from `src/index.ts`.
- [X] T014 [US2] Add `licenseListing` to `packages/api/src/routers/marketplace.ts`.
- [X] T015 [US2] L3 money-path suite in `packages/api/src/__tests__/l3-marketplace.test.ts`: happy walk asserting license + ledger (identity `price = take + credit` exact) + copy (provenance complete, lineage names source, reseller tenant) + both PMF events in one transaction's effects; forced mid-tx failure via executor-boundary fault injection (research D6) → ZERO new rows across license/ledger/itinerary/pmf_event; concurrent duplicate license (`Promise.all`) → exactly one `licensed`, one `already_licensed`, single ledger row; self-license → `own_listing`; unvetted reseller → `not_vetted`; deactivated listing → `not_active`; zero-price listing licenses cleanly with zero-amount split recorded.

**Checkpoint**: the INV-012 money path is proven conserving — the P0 trade layer works.

## Phase 5: User Story 3 — Licensee rates a listing (P3)

**Goal**: licensees-only ratings, upsert semantics, live aggregates in browse.

**Independent test**: after one license, reseller rates → aggregate updates; non-licensee refused (spec US3 scenarios 1–4).

- [X] T016 [US3] Implement `packages/marketplace/src/ratings.ts` `rateListing` (license-holder check → typed `not_licensee`; upsert on `(listing_id, rater_agency_id)` bumping `updated_at`; `recordPmfEvent(listing_rated)`; returns fresh aggregate — contracts §5) and wire the real rating aggregate (avg 1 d.p. + count) into `browseListings`. Export from `src/index.ts`.
- [X] T017 [US3] Add `rateListing` to `packages/api/src/routers/marketplace.ts`; L3 additions in `l3-marketplace.test.ts`: licensee rates (aggregate visible in browse), non-licensee → `not_licensee`, re-rate replaces (count stable, average moves), stars bounds rejected by zod.

## Phase 6: Polish & cross-cutting

- [X] T018 [P] L2 caller-ladder test `packages/api/src/__tests__/marketplace-rbac.test.ts` (agency-admin-rbac precedent): anon → UNAUTHORIZED and traveler (no agency) → FORBIDDEN on all five `workspace.marketplace.*` procedures.
- [X] T019 Run the full gate set per quickstart §1–3 (in-image when host pnpm is denied): root `pnpm test` (all L1/L2 + env-gated L3 green against compose Postgres), `pnpm run lint`, depcruise clean, typecheck clean.
- [X] T020 INV-027 Live Test & Fix per quickstart §4: boot built compose stack, smoke + e2e, drive the trade journey live (two agencies, vet script, list → browse → license → rate + refusal witnesses), archive per-step evidence to `.kitchenloop/evidence/iter-3/seed-0006/`, compose-log scan clean; fix-rebuild-retest on any defect (max 3 cycles).

## Dependencies

- Phase 1 → Phase 2 → US1 → US2 → US3 → Polish. US2 depends on US1 (needs a listing); US3 depends on US2 (needs a license). Within phases, [P] tasks touch disjoint files.
- No external/backlog blockers: seed-0001/0002 merged; no schema version bump.

## Parallel example (Phase 2)

T002+T003 (domain), T004 (db schema), T005 (pmf events), T006 (script) touch
disjoint files and can proceed in any order; T007 needs T001+T004.

## Implementation strategy

MVP = Phase 1–3 (US1: supply + vetting gate visible). Deliver US2 next (the
money path — the bulk of L3 risk), then US3, then polish gates. All phases ship
in ONE PR (kitchen-loop ticket seed-0006) with the SDD artifacts.
