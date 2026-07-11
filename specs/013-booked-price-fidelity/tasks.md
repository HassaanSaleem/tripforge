# Tasks: Booked-Price Fidelity on the Client View

**Input**: Design documents from `/specs/013-booked-price-fidelity/` (plan.md, research.md
D1–D7, data-model.md, contracts/client-view-projection.md, quickstart.md)

**Tests**: REQUIRED — money-adjacent read path (quality bar: L3 on real Postgres mandatory;
bug-fix discipline: red witness BEFORE the fix).

**Organization**: Phases 3–5 map to spec user stories US1 (P1 booked prices), US2 (P2
estimate/confirmed presentation), US3 (P3 un-booked regression guard).

## Phase 1: Setup

- [x] T001 Land the ideate-authored reseller scenario on this branch (research D6):
      `git checkout d0a9fdc -- scenarios/incubating/reseller-books-copy-live/` — scenario
      dir only, NOT the iteration report in the same commit.

## Phase 2: Foundational — red witnesses (write FIRST, run RED against unfixed code)

- [x] T002 Extend `packages/api/src/__tests__/l3-client-view.test.ts` with the seed-0025
      repro (real Postgres): draft → quote at 2200 bps → book all components →
      `clientView.itinerary` per-item `sellMinor` values equal the `booking_component`
      sells and `totalSellMinor` equals the itinerary's `markup_ledger` sell sum exactly;
      plus a MIXED case (book a subset → total = booked sells + document estimates for the
      rest). Run it in-image and RECORD THE RED (expected: view shows net-rate placeholder,
      delta = markup).
- [x] T003 [P] Extend `packages/api/src/__tests__/client-view-projection.test.ts` (L1) with
      distinct net/sell sentinels: projection prefers the booked component sell over the
      document `sellPrice`; a booked item with NO document pricing still shows the booked
      sell; un-booked items keep document values; the fold equals the sum of shown values;
      a booked price whose currency differs from the document currency throws (domain
      `MoneyError`, research D3). RECORD THE RED for the preference cases.

## Phase 3: User Story 1 — Traveler sees real client prices on a booked trip (P1) 🎯 MVP

- [x] T004 [US1] In `packages/api/src/services/client-view.ts`: extend the
      `resolveShareLink` booking-component select with `sellMinor` + `currency`; build
      `bookedPriceByItemId: ReadonlyMap<string, Money>` via domain `money(sellMinor,
      component.currency)` (component's OWN currency — loud-failure tripwire, research D3).
- [x] T005 [US1] In the same file: change `toClientItineraryView(document, agencyName,
      bookedPriceByItemId)` — the map replaces the `bookedItemIds` set (its key set IS the
      booked set, research D2); per item `booked = map.has(id)`, `sellMinor = booked
      component sell ?? document sellPrice ?? null`; `addMoney` fold sums exactly the shown
      values (FR-002). Update the doc comment (allowlist semantics unchanged; booked-price
      projection per spec 013).
- [x] T006 [US1] Green witness: run the L1 + L3 suites in-image; T002/T003 flip red→green
      with ZERO minor-unit delta; update the stale pinned comment in
      `packages/api/src/__tests__/l3-client-view.test.ts` (~line 207: "Draft-time documents
      set sellPrice = netRate…") to note booked items now project the component sell — and
      verify the leaf-scan still passes (a booked item's NET amount must now be a scannable
      secret when it differs from the shown sell; strengthen the `confidential` list to
      include booked items' net amounts unconditionally if the scan doesn't already).

## Phase 4: User Story 2 — Estimated vs confirmed presentation (P2)

- [x] T007 [US2] In `apps/web/lib/client-view.ts`: add a pure price-presentation helper
      (e.g. `priceQualifier(item): "estimate" | null` and a total-qualifier predicate
      `totalIncludesEstimates(items)`) — DOM-free boolean logic per research D2, white-label
      safe. L1-test it in the web lib's existing test home (check `apps/web/lib/__tests__/`
      or sibling pattern; create alongside existing lib tests).
- [x] T008 [US2] In `apps/web/app/(client-view)/view/[token]/page.tsx`: un-booked priced
      items render a small `estimate` marker beside the price; booked items keep the
      `Booked` badge (spec 010 FR-009 — unchanged) with their price presented as confirmed;
      the trip-total line gains "includes estimates" when any estimate contributes
      (research D7, `.tf-*` kit; add minimal CSS to `apps/web/app/globals.css` only if an
      existing token doesn't cover it).
- [x] T009 [US2] Extend `tests/e2e/client-view-journey.spec.ts`: (a) in the existing
      un-booked share test, assert the estimate marker + estimates-qualified total (US2
      scenario 2); (b) add a BOOKED journey test — sign up, draft, quote at a non-default
      markup via the booking panel, book, capture the confirmation's formatted client
      prices, share, open anonymously → the traveler page shows THOSE exact formatted
      amounts (planner-agnostic UI-to-UI equality) with no estimate marker on booked items.
      Reuse `tests/e2e/support.ts` + booking-journey helpers.

## Phase 5: User Story 3 — Un-booked shares unchanged (P3, regression guard)

- [x] T010 [US3] Verify NO existing assertion weakened: existing projection L1 suite,
      l3-client-view redaction/leaf-scan, trust-boundary + client-view e2e all pass
      untouched (un-booked values still come verbatim from the document). Any failure is a
      defect in THIS feature — fix here, never adjust the old assertions.

## Phase 6: Polish & cross-cutting

- [x] T011 [P] Promote the price-fidelity observation in
      `scenarios/incubating/reseller-books-copy-live/scenario.mjs` to a hard `check(...)`:
      client-view booked sum === reseller `markup_ledger` sell sum (SC-005); keep the
      console note as the witness line.
- [x] T012 [P] Amend `specs/010-client-view-share/spec.md` (Assumptions bullet "Prices
      shown are the itinerary's stored sell prices" + FR-008) and
      `specs/005-budget-quote-book/spec.md` (Assumptions) with "Amended by spec 013
      (2026-07-11)" provenance notes per research D5 — original text preserved.
- [x] T013 Full gates in-image: `pnpm test` (all suites vs compose Postgres), `pnpm run
      lint`, typecheck, depcruise; L3 smoke `node tests/integration/smoke.mjs`.
- [x] T014 Live Test & Fix (INV-027) per `specs/013-booked-price-fidelity/quickstart.md`:
      fresh `docker compose down -v && docker compose up --build --wait`; e2e suite; MCP
      browser QA journey (draft → quote 22% → book → share → anonymous /view) with
      per-step screenshots to `.kitchenloop/evidence/iter-3/seed-0025/`; DB cross-check
      (psql markup_ledger sum == view total); both live scenarios; compose-log scan vs
      allowlist.

## Dependencies

- T001 → T011 (scenario must exist on the branch before promotion).
- T002/T003 (red) → T004/T005 (fix) → T006 (green) — strict bug-fix order.
- T004 → T005 (same file, sequential). US1 complete before US2 presentation (T007–T009
  render values US1 makes correct). T010 after US1+US2. T013/T014 last.

## Parallel opportunities

- T002 ∥ T003 (different test files). T011 ∥ T012 (scenario vs spec docs). T007 can start
  once T005's payload semantics are fixed (independent of T006's run).

## Implementation strategy

MVP = Phase 3 (US1): the money-trust defect is fixed and L3-proven even before the
presentation polish. US2 rides the same PR (folded-in FEAT-1); US3 is a verification gate,
not new code. Single PR carries spec 013 + amendments + implementation (SDD cycle, ticket
seed-0025).
