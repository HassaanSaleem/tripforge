# Feature Specification: Canonical Itinerary Schema v0

**Feature Branch**: `002-canonical-itinerary-schema`

**Created**: 2026-07-06

**Status**: Draft — **implementation gated on operator authorization** (schema
version bump is ALWAYS-HALT; see [plan.md](./plan.md) Migration Note and
OPERATOR-DESK row **D-006**).

**Input**: seed-0002 — "Canonical itinerary schema v0 (Constitution IV) via SDD".
Define the single versioned itinerary schema that flows unchanged through
build → book → trade. Core entities: itinerary, day, item (stay/activity/
transfer), media ref, pricing block. Provenance fields: original author, license
terms, revenue-share obligations, rebrand lineage. JSON Schema (or zod) +
TypeScript types + schema version field and migration convention. Depends on:
seed-0001 (merged, commit `0a1b1dc`).

## Overview

seed-0001 landed a **versioned stub** of the itinerary type in
`packages/itinerary-schema` (`SCHEMA_VERSION = "0.0.0"`; `id`, `agencyId`,
`title`, `provenance`). This feature replaces that stub with the full v0 entity
graph — the platform's core entity (Constitution IV, INV-001). The itinerary is
the one object every layer speaks: the builder writes it, the budget allocator
prices it, the booking layer books against it, and the marketplace lists,
licenses, and white-labels it. If it cannot move losslessly build → book →
trade, the product thesis breaks (Constitution IV rationale).

The "users" of this feature are the **other packages**: `domain` (budget
allocator + money math), `db` (persistence), `supply-adapter` (booking against
items), `marketplace` (listing/licensing), and `api` (validation at boundaries).
Their shared contract is this schema, and INV-001 forbids any of them from
declaring an itinerary-shaped type of their own.

> **Governance gate (read first).** Expanding the schema shape and bumping
> `SCHEMA_VERSION` is a canonical-itinerary-schema change. Per Constitution
> Principle IV + Development Workflow, DIRECTIVE.md item 2, and the stub's own
> comments, this is an **ALWAYS-HALT operator gate** — the loop **designs**
> (this spec + plan + data model + migration note) and the operator **authorizes
> the landing**. No schema code ships until D-006 is answered.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A built itinerary round-trips through validation losslessly (Priority: P1) 🎯 MVP

Any package that produces or receives an itinerary passes it through
`packages/itinerary-schema`. A fully-populated itinerary (multiple days, mixed
item kinds, media refs, a pricing/budget block, provenance) validates, and
`parse → serialize → parse` returns an equal value with no field loss. No other
package declares an itinerary-shaped type (INV-001).

**Why this priority**: Loss-free flow across layers is the entire reason the
schema is canonical (Constitution IV). It is the smallest slice that proves the
schema can carry a real trip end to end.

**Independent Test**: Build a representative itinerary object in a test, call
`parseItinerary(obj)` → succeeds; `parseItinerary(JSON.parse(JSON.stringify(parsed)))`
→ deep-equals `parsed`. Runs as an L1 unit test, no I/O.

**Acceptance Scenarios**:

1. **Given** a valid itinerary with ≥2 days, a stay + an activity + a transfer
   item, ≥1 media ref, a pricing block, and provenance, **When** it is parsed,
   **Then** validation succeeds and every field is preserved.
2. **Given** the parsed itinerary is serialized to JSON and re-parsed, **When**
   the two are compared, **Then** they are deep-equal (round-trip is lossless).
3. **Given** an object with an unknown top-level field, **When** it is parsed,
   **Then** the unknown field is rejected (strict), so no layer can smuggle an
   un-versioned extension past the schema.

### User Story 2 - Money on the itinerary is always integer-minor + currency (Priority: P1)

Every monetary value carried by the schema — item net rate / sell price, per-day
subtotals, the per-category budget breakdown, the itinerary total — is a `Money`
value (`{ amountMinor: integer, currency }`, INV-009), never a float or bare
number. A non-integer or currency-less amount fails validation at the boundary.

**Why this priority**: Money-safety is a load-bearing invariant for every later
booking/markup/revenue-share path (INV-009/010). Establishing it in the schema
means the allocator (seed-0005) and marketplace (seed-0006) inherit it for free.

**Independent Test**: L1 test — a pricing block with `amountMinor: 12.5` or a
missing currency fails `parseItinerary`; a valid integer-minor amount passes.

**Acceptance Scenarios**:

1. **Given** a pricing block whose amount is `19999` minor units in `"USD"`,
   **When** parsed, **Then** it validates and reads back as `{ amountMinor:
   19999, currency: "USD" }`.
2. **Given** a pricing block with a fractional `amountMinor`, **When** parsed,
   **Then** validation fails with a clear money error.
3. **Given** two Money fields on the same itinerary with different currencies in
   a place the schema requires a single currency (e.g. the budget breakdown
   categories vs. the itinerary total), **When** parsed, **Then** the mismatch
   is rejected (currency-consistency rule).

### User Story 3 - Provenance travels with the itinerary; listing makes it mandatory (Priority: P2)

Provenance (original author agency, license terms, revenue-share obligation,
rebrand lineage) is part of the itinerary, not an afterthought (INV-002,
Constitution IV/VI). At v0 the base type keeps provenance present-but-optional
(a freshly-built, unlisted trip need not declare license terms yet); a helper
type expresses the marketplace requirement that a **listed** itinerary carries
complete provenance, which seed-0006 enforces in the transaction path.

**Why this priority**: Provenance is what makes resale/white-label trustworthy
(Constitution VI). It must be in the schema now so the marketplace seed builds on
it rather than bolting it on. It is P2 only because no listing flow exists yet.

**Independent Test**: L1 test — the base `ItinerarySchema` accepts an itinerary
with empty/partial provenance; the `ListedItinerary` refinement rejects one
missing `originalAuthorAgencyId`, `licenseTerms`, or `revenueShareBps`.

**Acceptance Scenarios**:

1. **Given** a newly built itinerary with no license terms, **When** parsed as a
   base `Itinerary`, **Then** it validates (provenance optional at build time).
2. **Given** the same itinerary, **When** validated as a `ListedItinerary`,
   **Then** it is rejected until author + license terms + revenue-share are set.
3. **Given** a white-labeled copy, **When** its `rebrandLineage` records the
   source listing id, **Then** the lineage is preserved through parse/serialize.

### Edge Cases

- **Unknown/older `schemaVersion`**: parsing an itinerary whose version is not
  the current one MUST NOT silently accept it. It routes through the migration
  convention (US-adjacent, see plan) — a known older version is upgraded by a
  registered migrator; an unknown version is rejected with a clear error.
- **Empty itinerary**: zero days is valid (a draft shell); an itinerary with a
  day that has zero items is valid (an unplanned day).
- **Item currency vs. itinerary currency**: all Money on one itinerary shares the
  itinerary's `currency`; a per-item amount in a foreign currency is rejected at
  v0 (multi-currency conversion is an explicit, logged operation per INV-009 and
  is the booking layer's job — the schema stores one settled currency).
- **Media ref provenance**: a media ref MUST carry a licensed source; the schema
  has no field that could hold a scraped or AI-fabricated-as-real image path
  (Constitution Compliance & Content Sourcing) — `source` is a constrained enum.
- **Car-rental items**: the seed enumerates stay/activity/transfer; the supply
  port family (seed-0003) also includes car rental. Whether `carRental` is a
  fourth item kind at v0 or deferred is an **open decision for the operator**
  (see plan.md Open Decisions) because it interacts with the version the
  operator authorizes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The full itinerary entity graph MUST be declared ONLY in
  `packages/itinerary-schema` as zod schemas + inferred TypeScript types
  (INV-001). No other package may declare an itinerary-, day-, item-, media-ref-,
  or pricing-shaped type; they import from this package.
- **FR-002**: The schema MUST carry a `schemaVersion` literal and the feature
  MUST define a **migration convention**: a registry mapping a known older
  version to a pure upgrade function, a single `SCHEMA_VERSION` source of truth,
  and the rule that any shape change bumps the version, adds a migrator, and
  records a migration note in the feature plan (operator-gated).
- **FR-003**: An **Itinerary** MUST contain: `schemaVersion`, `id`, `agencyId`
  (tenant, INV-004), `title`, a base `currency`, an ordered list of **days**, a
  **pricing block** (budget breakdown), optional itinerary-level **media refs**,
  and **provenance**.
- **FR-004**: A **Day** MUST contain a stable ordering key (day number and/or
  date), an ordered list of **items**, and MAY carry a per-day subtotal
  (`Money`) consistent with the itinerary currency.
- **FR-005**: An **Item** MUST be a discriminated union on `kind` covering at
  least `stay`, `activity`, `transfer` (per the seed), each with a stable `id`,
  a human title, an optional supply/booking reference, optional media refs, and
  an optional per-item pricing snapshot in the itinerary currency.
- **FR-006**: A **MediaRef** MUST be a reference (id + storage key or URL) with a
  constrained `source` (licensed real imagery / official embed / authentic UGC —
  never scraped or AI-fabricated-as-real, Constitution Compliance), `kind`
  (image/video/embed), alt text, and optional attribution. The schema stores
  references only; binary/static content materialization is `db`'s job (INV-025).
- **FR-007**: A **PricingBlock / budget breakdown** MUST express the total budget
  (with a `budgetMode` of hard-cap or target), a per-category allocation across
  the Constitution III categories (flights/transport, accommodation, activities,
  local transport, buffer), and MUST use `Money` (integer minor units + currency,
  INV-009) throughout. This breakdown persists with the itinerary (INV-015).
- **FR-008**: All `Money` on a single itinerary MUST share the itinerary's
  `currency`; a mismatch is a validation error. (Cross-currency conversion is an
  explicit, logged booking-layer operation, INV-009 — not stored implicitly.)
- **FR-009**: **Provenance** MUST include original author agency id, license
  terms, revenue-share obligation (basis points), and rebrand lineage (INV-002).
  On the base type these are optional (build time); a `ListedItinerary`
  refinement MUST require author + license terms + revenue-share for the
  marketplace listing path (enforced by seed-0006, defined here).
- **FR-010**: The package MUST export a `parseItinerary(input): Itinerary` (strict
  validation, unknown fields rejected) and the inferred types; the existing
  `parseItinerary` and `Provenance`/`ProvenanceSchema` exports MUST remain
  importable (no breaking of `packages/domain`'s `stampProvenance`, which imports
  `Itinerary`/`Provenance`).
- **FR-011**: The schema MUST NOT import from any other workspace package
  (`itinerary-schema` is a leaf, INV-017) — it depends only on `zod`. Money is
  represented structurally (`{ amountMinor, currency }`) matching
  `packages/domain`'s `Money` shape without importing it, so the leaf rule holds.
- **FR-012** *(deferred / operator-gated)*: Bumping `SCHEMA_VERSION` from the
  `"0.0.0"` stub to the v0 value and replacing the stub shape is the schema
  landing — **ALWAYS-HALT**. It ships only after operator authorization (D-006);
  the recommended version and migrator are specified in plan.md.

### Key Entities

- **Itinerary**: root canonical object; `schemaVersion`, `id`, `agencyId`,
  `title`, `currency`, `days[]`, `pricing` (budget breakdown), `media[]`,
  `provenance`.
- **Day**: ordered container; `dayNumber` (and/or `date`), `items[]`, optional
  `subtotal` (Money).
- **Item**: discriminated union on `kind` (`stay` | `activity` | `transfer`
  [ | `carRental`, open decision]); `id`, `title`, optional `supplyRef`,
  `media[]`, `pricing` (Money snapshot).
- **MediaRef**: `id`, `kind`, `storageKey`/`url`, `source` (licensed enum),
  `alt`, optional `attribution`. Reference only.
- **PricingBlock (budget breakdown)**: `budgetMode` (hard-cap | target),
  `total` (Money), `categories` (Money per Constitution III category),
  optional per-day rollup. Persists with the itinerary (INV-015).
- **Provenance**: `originalAuthorAgencyId`, `licenseTerms`, `revenueShareBps`,
  `rebrandLineage[]` (INV-002). Optional on base; required on `ListedItinerary`.
- **Money** (structural, not imported): `{ amountMinor: integer, currency }`
  (INV-009) — the shape shared with `packages/domain`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A representative multi-day, multi-item itinerary round-trips
  (`parse → serialize → parse`) losslessly in an L1 test.
- **SC-002**: Every monetary field on the schema is `Money` (integer minor +
  currency); a fractional or currency-less amount fails validation.
- **SC-003**: No itinerary-, day-, item-, media-ref-, or pricing-shaped type
  exists outside `packages/itinerary-schema` (grep-clean, INV-001), and
  dependency-cruiser shows the package remains a leaf (INV-017).
- **SC-004**: `packages/domain`'s `stampProvenance` and its tests still compile
  and pass against the new types (no downstream break).
- **SC-005**: The `ListedItinerary` refinement rejects incomplete provenance;
  the base type accepts it (US3 acceptance).
- **SC-006**: The migration convention is exercised by a test: a `"0.0.0"`-shaped
  input is upgraded to the current version, and an unknown version is rejected.
- **SC-007**: The plan carries a versioned migration note and the Constitution
  Check passes; exactly one OPERATOR-DESK row (**D-006**) requests authorization
  for the version bump, and no sealed regulator file is edited.

## Assumptions

- The stub in `packages/itinerary-schema` is the starting point; v0 extends it
  **in place** (no fork), preserving the `parseItinerary`/`Provenance` exports
  `packages/domain` already depends on.
- Money is represented structurally in the schema to keep the leaf boundary
  (INV-017); `packages/domain`'s `Money` type is the canonical home of money
  *math*, the schema only carries money *values*.
- Live rates/quotes are NOT part of the persisted schema beyond a value snapshot
  + optional supply/quote reference; hold/expiry and re-quote mechanics are
  seed-0003/seed-0005 (INV-006, INV-025/026). The schema stores the settled
  snapshot, not a live-cached rate.
- The version string, the car-rental item-kind decision, and the exact migrator
  are **operator decisions** (plan.md Open Decisions + D-006); this spec is
  written so either choice slots in without reshaping the entity graph.
- Implementation does not begin until D-006 is answered — this spec/plan/tasks
  ship first for owner review (Constitution Development Workflow: schema changes
  require the owner's review before merge).
