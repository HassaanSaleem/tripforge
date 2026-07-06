# Tasks: Canonical Itinerary Schema v0

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [data-model.md](./data-model.md)

> **⛔ ALL TASKS BELOW ARE GATED ON OPERATOR-DESK D-006.** Expanding the schema
> shape and bumping `SCHEMA_VERSION` is a canonical-itinerary-schema version
> bump/migration = **ALWAYS-HALT** (DIRECTIVE item 2). No task here may be
> executed until the operator authorizes the landing (says `land schema v0`).
> This file is the executable plan a *future* execute iteration runs **after**
> authorization (via `/speckit-implement`) — it is design output, not a to-do the
> loop may start now.

## Format: `[ID] [P?] [Story] Description`

- **[P]** = parallelizable (different files, no ordering dependency).
- **[US#]** = the user story from spec.md it serves.

## Phase A — Gate

- [ ] **T000** *(operator)* Answer OPERATOR-DESK **D-006**: confirm version string
  (D-006.a), car-rental item kind (D-006.b), media source enum (D-006.c), and
  authorize the version bump. **Blocks every task below.**

## Phase B — Money & leaf primitives (after T000)

- [ ] **T001** [P] [US2] Add `src/money.ts`: `MoneySchema` (integer-minor +
  3-letter currency, `.strict()`) + `Money` type (INV-009). No workspace import
  (INV-017). Unit: fractional `amountMinor` and missing currency both fail.
- [ ] **T002** [P] [US1] Add `src/media.ts`: `MediaSourceSchema` (closed licensed
  enum, per D-006.c) + `MediaRefSchema` (reference-only, storageKey|url refine,
  Constitution Compliance). Unit: a media ref with neither key nor url fails.

## Phase C — Entities (after B)

- [ ] **T003** [US1] Add `src/item.ts`: `ItemBase` + `StayItemSchema`,
  `ActivityItemSchema`, `TransferItemSchema` ( + `CarRentalItemSchema` iff
  D-006.b = include), `ItemPricingSchema`, and `ItemSchema` discriminated union
  on `kind`. `supplyRef` is opaque (INV-005). Depends on T001, T002.
- [ ] **T004** [P] [US1] Add `src/day.ts`: `DaySchema` (dayNumber, optional date,
  optional `subtotal: Money`, `items[]`). Depends on T003.
- [ ] **T005** [P] [US3] Add `src/pricing.ts`: `BudgetCategorySchema` (5
  Constitution-III categories) + `PricingBlockSchema` (budgetMode, total,
  categories). Persists w/ itinerary (INV-015). Depends on T001.
- [ ] **T006** [P] [US3] Update `src/provenance.ts` (or add here): keep the stub
  `ProvenanceSchema` fields (FR-010) + add `ListedItinerarySchema` refinement
  (author + licenseTerms + revenueShareBps required) — INV-002/012.

## Phase D — Root + migration (after C)

- [ ] **T007** [US1/US2] Add `src/itinerary.ts`: `SCHEMA_VERSION` (per D-006.a),
  `ItinerarySchema` (currency + days + media + pricing + provenance) with the
  `assertSingleCurrency` superRefine (FR-008). Depends on T004, T005, T006.
- [ ] **T008** [US1] Add `src/migrate.ts`: `SCHEMA_VERSION` re-export, `MIGRATORS`
  registry, `upgradeFrom000` (stub → v0), and rewrite `parseItinerary` to migrate
  known older versions and reject unknown ones (FR-002). Depends on T007.
- [ ] **T009** [US1] Rewrite `src/index.ts`: re-export the public surface
  (`Itinerary`, `ItinerarySchema`, `ListedItinerary`, `parseItinerary`,
  `SCHEMA_VERSION`, `Provenance`/`ProvenanceSchema`, and the entity schemas).
  Keep the exact names `packages/domain` imports (FR-010). Depends on T001–T008.

## Phase E — Tests (L1, after D) — no test weakened, all must pass

- [ ] **T010** [P] [US1] `__tests__/roundtrip.test.ts`: a fully-populated
  itinerary parses; `parse→serialize→parse` deep-equals; unknown top-level field
  rejected (SC-001, SC-003).
- [ ] **T011** [P] [US2] `__tests__/money.test.ts`: fractional/missing-currency
  amounts fail; valid integer-minor passes; cross-currency itinerary rejected
  (SC-002, FR-008).
- [ ] **T012** [P] [US3] `__tests__/provenance.test.ts`: base accepts partial
  provenance; `ListedItinerary` rejects incomplete; rebrand lineage round-trips
  (SC-005).
- [ ] **T013** [P] [US1] `__tests__/migration.test.ts`: `"0.0.0"` input upgrades
  to current; unknown version rejected (SC-006).

## Phase F — Downstream + gates (after E)

- [ ] **T014** Confirm `packages/domain` (`stampProvenance` + `money.test.ts`)
  still compiles and passes against the new types (SC-004). Fix imports only if a
  name changed (it should not — FR-010).
- [ ] **T015** Run `npm run lint`, `npm test`, `npx depcruise` (INV-017 leaf
  check), and grep for any itinerary/day/item/pricing-shaped type outside
  `packages/itinerary-schema` (SC-003). All green.
- [ ] **T016** Update the coverage matrix / itinerary-schema surface note as the
  loop conventions require; PR body carries the Constitution Check + the migration
  note + the spec-alignment table (each FR → file → test).

## Dependency graph

```text
T000 (gate) ─▶ T001,T002 ─▶ T003 ─▶ T004
                    │              └─▶ (T005 needs T001) 
                    └─▶ T005, T006
        T004,T005,T006 ─▶ T007 ─▶ T008 ─▶ T009 ─▶ T010..T013 ─▶ T014,T015,T016
```

## Notes

- This is a leaf-package, pure-validation feature: **no L2/L3 needed here** (no
  boundary/handler/DB of its own). Downstream L3 money-path tests land with
  seed-0004/0005/0006, which consume this schema.
- Live Test & Fix (INV-027): the schema package has no runnable surface, so the
  *implementation* PR records Live Test Evidence as `N/A (library-only, no
  product-behavior surface)` — unless the operator's D-006 answer bundles a
  consuming demo, in which case it live-verifies that.
