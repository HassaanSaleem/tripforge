# Implementation Plan: Canonical Itinerary Schema v0

**Branch**: `002-canonical-itinerary-schema` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-canonical-itinerary-schema/spec.md`

> **STATUS: DESIGN-ONLY / IMPLEMENTATION GATED.** This plan and its sibling
> artifacts (spec, data-model, tasks) are the loop's *proposal*. The schema code
> change — expanding the entity graph in `packages/itinerary-schema` and bumping
> `SCHEMA_VERSION` — is a **canonical-itinerary-schema version bump/migration**,
> which is **ALWAYS-HALT** per DIRECTIVE.md item 2, Constitution Principle IV +
> Development Workflow ("review by the project owner before merge"), and the
> stub's own comments ("A version BUMP … never done autonomously by the loop").
> The loop **designs**; the operator **authorizes the landing** (OPERATOR-DESK
> **D-006**). No schema code ships in the same PR as this plan.

## Summary

Replace the `SCHEMA_VERSION = "0.0.0"` stub in `packages/itinerary-schema` with
the full v0 canonical entity graph — Itinerary → Day → Item (stay / activity /
transfer) → MediaRef, plus a PricingBlock (budget breakdown) and Provenance —
all expressed as zod schemas with inferred TypeScript types. Money is carried
structurally as `{ amountMinor: integer, currency }` (INV-009) without importing
`packages/domain` (keeps the leaf boundary, INV-017). A migration convention
(single `SCHEMA_VERSION`, a version→migrator registry, strict rejection of
unknown versions) makes future changes safe and auditable. The package keeps its
current public surface (`parseItinerary`, `ItinerarySchema`, `Provenance`) so
`packages/domain`'s `stampProvenance` keeps compiling.

## Technical Context

**Language/Version**: TypeScript 5.x (matches the monorepo `tsconfig.base.json`).

**Primary Dependencies**: `zod` only (the package is a workspace leaf, INV-017).
No new runtime dependency is introduced.

**Storage**: N/A directly — the schema defines shapes; `packages/db` persists
them (INV-003, out of scope here). Media binaries/static content are
materialized by `db` (INV-025); the schema stores references only.

**Testing**: Vitest L1 (pure, no I/O): round-trip losslessness, money-safety,
provenance refinement, migration convention. No L2/L3 needed — this package has
no boundary/handler/DB of its own; downstream L3 (booking/marketplace) lands with
seed-0004/0005/0006. Deterministic fixtures only.

**Target Platform**: Shared library consumed by all packages/apps.

**Project Type**: Workspace package (`packages/itinerary-schema`), monorepo.

**Performance Goals**: N/A — validation is synchronous and small; no hot path.

**Constraints**: Leaf package (imports only `zod`, INV-017); money is integer
minor units + currency (INV-009); INV-001 (sole home of the itinerary type);
INV-002 (versioned + provenance); Constitution Compliance (media source is
licensed-only, no field for scraped/AI-fabricated-as-real imagery). No sealed
regulator file edited. **Schema version bump is ALWAYS-HALT (operator-gated).**

**Scale/Scope**: One package, ~6 entity schemas + a migration registry + ~4 L1
test files. Deliberately minimal — YAGNI on anything the P1+ roadmap needs
(e.g. multi-currency storage, per-item quote/hold state → seed-0003/0005).

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0 (six principles).
Must pass before implementation; re-checked after design (below).*

| Principle | Gate | Verdict |
|-----------|------|---------|
| **I. Marketplace-First** | Deepens liquidity / grows the agent base? | **PASS** — the canonical schema is the object the marketplace lists, licenses, and white-labels. Provenance + `ListedItinerary` refinement are exactly the substrate the trade layer (seed-0006) needs. Builds nothing P1+/non-goal. |
| **II. Agent Experience Is the Wedge** | Agent-fast, client-branded, white-label first-class? | **PASS (foundation)** — the schema carries agency-owned branding/media and provenance so the white-labeled client surface renders the agent's brand, never the platform's (INV-020). No agent workflow exists yet to regress. |
| **III. Budget-Aware AI, Priced Against Reality** | AI tied to a measurable outcome; no static unbookable output? | **PASS** — the PricingBlock encodes the Constitution-III budget categories and persists the per-category/per-day breakdown with the itinerary (INV-015). It stores *values* (Money), not AI text; it is the shape the allocator (seed-0005) fills against live inventory. No planner ships here. |
| **IV. Canonical Itinerary Schema** | One versioned schema, no forks/private extensions? | **PASS (this IS the principle)** — the full entity graph lives ONLY in `packages/itinerary-schema` (INV-001), is versioned with a migration convention (INV-002), and no other package declares an itinerary-shaped type (grep + dependency-cruiser). The change is done as a **versioned migration with a note in this plan** (below) and is **operator-gated before merge** — exactly the workflow Principle IV mandates. |
| **V. Integrate Supply, Don't Contract It** | Supplier-agnostic; no leaked API shapes? | **PASS** — Item carries an OPTIONAL, supplier-agnostic `supplyRef` (an opaque id + port/component discriminator), never a supplier API shape (INV-005). Concrete supplier payloads stay inside `packages/supply-adapter` (seed-0003). |
| **VI. Trust, Provenance & Revenue-Share Integrity** | Money-safe; splits enforceable in the transaction path? | **PASS** — all money is integer-minor + currency (INV-009); provenance (author, license, revenue-share bps, rebrand lineage) is a first-class field (INV-002); the `ListedItinerary` refinement makes complete provenance a hard requirement for the listing path so seed-0006 can enforce the split inside the transaction (INV-012). The schema carries money *values*; the *math* stays pure in `packages/domain` (INV-010) — the schema does not import it. |

**Non-Goals / MVP discipline**: nothing from the Non-Goals list or P1+/P2+/P3+
roadmap is implemented. Multi-currency *storage*, live quote/hold state on items,
and any consumer-surface field are explicitly out of scope for v0 (YAGNI, MVP
Scope Discipline). No constitution amendment occurs.

**Schema-change gate (Constitution IV + Development Workflow)**: this feature
*does* change the canonical schema, so it carries the required **versioned
migration note** (below) and MUST receive **project-owner review before merge**.
The loop cannot self-authorize a version bump (DIRECTIVE item 2 = ALWAYS-HALT) —
hence OPERATOR-DESK **D-006**. Constitution Check is otherwise **PASS**.

**Post-design re-check**: the design introduces no new cross-feature structure
beyond what the architecture doc already names (INV-001/002/009/015/017/025); it
proposes **no new invariant**. Constitution Check remains **PASS** after design.

**Complexity Tracking**: no violations — table omitted.

## Migration / schema notes *(REQUIRED — Constitution IV, and the operator's D-006 review target)*

This is a **canonical-itinerary-schema version bump + shape migration**. Per
Constitution Principle IV, DIRECTIVE.md item 2, and the seed-0001 stub comments,
it is **ALWAYS-HALT / operator-gated** and does not ship autonomously. The
operator reviews *this note* to authorize the landing.

**From → To**
- **From**: `SCHEMA_VERSION = "0.0.0"` — stub shape
  `{ schemaVersion, id, agencyId, title, provenance }`.
- **To (recommended)**: `SCHEMA_VERSION = "0.1.0"` — full v0 entity graph
  (Itinerary + Day + Item + MediaRef + PricingBlock + Provenance) per
  [data-model.md](./data-model.md). Recommend `"0.1.0"` (a minor within the 0.x
  "v0" line) rather than `"1.0.0"`; the operator confirms the exact string in
  D-006.

**Backward-compatibility & migrator**
- A `migrate(input): Itinerary` upgrade function is added. A `"0.0.0"` stub value
  upgrades by: keeping `id`/`agencyId`/`title`/`provenance`, defaulting
  `currency` (see Open Decisions), `days: []`, and a zero-total `pricing` block.
  No `"0.0.0"` production data exists (the stub was never persisted with real
  itineraries), so the migrator is a safety net + a worked example of the
  convention, not a data backfill.
- `parseItinerary` rejects any `schemaVersion` that is neither the current version
  nor a registered older version — no silent acceptance (spec Edge Cases).

**Migration convention (the durable rule this establishes)**
1. `SCHEMA_VERSION` is the single source of truth for the current version.
2. Any change to the entity graph bumps `SCHEMA_VERSION`, adds a pure migrator
   `(old) → (new)` to the registry, and records a From→To note in that feature's
   plan.
3. A version bump is an **operator gate** (ALWAYS-HALT) — the loop proposes, the
   owner authorizes before merge.

**Open Decisions for the operator (fold into the D-006 answer)**
- **D-006.a — Version string**: `"0.1.0"` (recommended) vs `"1.0.0"`.
- **D-006.b — Car-rental item kind**: add `carRental` as a 4th item `kind` at v0
  (aligns with the supply port family — hotel/activity/transfer/car, seed-0003/
  0005 book it) vs. ship stay/activity/transfer only per the seed wording and add
  `carRental` in a later bump. Recommendation: **include `carRental` now** — the
  entity graph is designed for it and adding it later is another operator-gated
  bump; deciding once is cheaper. Either choice slots in without reshaping.
- **D-006.c — Media `source` enum members**: proposed
  `licensed-stock | official-embed | agent-upload | traveler-ugc` (no member that
  could represent scraped or AI-fabricated-as-real imagery, Constitution
  Compliance). Operator confirms the closed set.

## Project Structure

### Documentation (this feature)

```text
specs/002-canonical-itinerary-schema/
├── spec.md          # done
├── plan.md          # this file (Constitution Check + migration note)
├── data-model.md    # the v0 entity graph, field by field
├── quickstart.md    # how downstream packages consume the schema
└── tasks.md         # dependency-ordered tasks (gated on D-006)
```

### Source Code (target of the gated implementation)

```text
packages/itinerary-schema/
  src/
    index.ts        # public surface: re-exports + parseItinerary + SCHEMA_VERSION
    money.ts        # structural Money zod (integer-minor + currency) — INV-009, no domain import
    media.ts        # MediaRef schema + licensed source enum
    item.ts         # Item discriminated union (stay/activity/transfer[/carRental])
    day.ts          # Day schema
    pricing.ts      # PricingBlock / budget breakdown (Constitution III categories)
    provenance.ts   # Provenance schema + ListedItinerary refinement (INV-002)
    itinerary.ts    # Itinerary root + currency-consistency refinement (FR-008)
    migrate.ts      # SCHEMA_VERSION + version→migrator registry (FR-002)
    __tests__/      # L1: roundtrip, money-safety, provenance, migration
```

**Structure Decision**: one file per entity under `packages/itinerary-schema/src`,
re-exported from `index.ts` so the package's public surface stays a single import
site (INV-001). The package imports only `zod` (leaf, INV-017) — Money is
structural, not imported from `domain`.

## Phased approach

- **Phase 0 (research)**: none required — entities and invariants are fixed by
  the seed + PRD §9.1 + architecture (INV-001/002/009/015/025). Open choices are
  operator decisions (above), not technical unknowns.
- **Phase 1 (design)**: [data-model.md](./data-model.md) — the field-level entity
  graph, the currency-consistency and provenance refinements, and the migration
  convention. Captured there; no separate contracts/ dir (no HTTP surface).
- **Phase 2 (tasks)**: [tasks.md](./tasks.md) — dependency-ordered, **all gated on
  D-006** (no schema code before authorization).

## Downstream impact (why this must be right before it lands)

- `packages/domain/src/provenance.ts` imports `Itinerary` + `Provenance` — the v0
  types MUST keep those names/shapes compatible (FR-010) or `stampProvenance`
  breaks. Verified in SC-004.
- `packages/db` (seed-later) persists this shape; a version bump after data exists
  would need a real backfill — landing v0 cleanly now avoids that.
- `packages/domain` budget allocator (seed-0005) fills the PricingBlock; its
  per-category/per-day breakdown persists here (INV-015).
- `packages/marketplace` (seed-0006) relies on the `ListedItinerary` refinement to
  enforce provenance/revenue-share in the transaction path (INV-002/012).
