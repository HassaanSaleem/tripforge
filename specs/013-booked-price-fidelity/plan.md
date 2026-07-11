# Implementation Plan: Booked-Price Fidelity on the Client View

**Branch**: `kitchen/fix-seed-0025-client-view-booked-prices` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-booked-price-fidelity/spec.md` (ticket seed-0025)

## Summary

The traveler share page prices booked trips from the canonical document's draft placeholder
(`sellPrice == netRate`), exposing the agency's net cost basis. Fix: **read-time projection**
— `resolveShareLink` already reads `booking_component` for booked flags; extend that read to
carry each component's recorded sell (`sell_minor`, itinerary currency) and have
`toClientItineraryView` prefer the booked component sell over the document's stored price,
per item. The `/view/[token]` page gains an estimated-vs-confirmed price presentation. The
canonical document is never written; no schema change; no new money writes. Sibling specs
005/010 are amended with provenance notes so code does not silently define the spec, and the
live reseller scenario's price-fidelity observation becomes a hard assertion.

## Technical Context

**Language/Version**: TypeScript 5.x (pnpm + turborepo monorepo)

**Primary Dependencies**: Next.js app router (apps/web), tRPC v11 (packages/api), Drizzle ORM
on Postgres (packages/db), pure domain money math (packages/domain — `money`, `addMoney`)

**Storage**: Postgres — READ-ONLY use of existing `booking_component` rows (`item_id`,
`sell_minor`, `currency`, tenant/itinerary scope). No migrations. No document writes.

**Testing**: Vitest L1 (`client-view-projection.test.ts`) + L3 vs real compose Postgres
(`l3-client-view.test.ts`), Playwright e2e (`tests/e2e/`), live scenario
(`scenarios/incubating/reseller-books-copy-live/scenario.mjs`)

**Target Platform**: Dockerized Next.js (compose stack), Vercel-serverless-correct (INV-028:
per-request DB reads, no in-process state)

**Project Type**: Web monorepo — API service + SSR page change

**Performance Goals**: No new queries — the existing booked-flag select gains two columns;
the projection stays a pure single-pass fold

**Constraints**: Zero client-side money arithmetic (server integer minor units, formatters
only — spec 010 FR-008); allowlist projection unchanged (FR-007/SC-003); INV-004 tenant
scoping preserved by the existing `scopedWhere` reads

**Scale/Scope**: 2 product files (service + page), 1 lib label helper if needed, 2 test
files extended, 2 sibling spec amendments, 1 scenario promotion

## Constitution Check

*GATE: evaluated before Phase 0 research; re-checked after Phase 1 design — PASS (both).*

- **I. Marketplace-First**: PASS. Repairs money-trust on the golden path (draft → book →
  share) that feeds marketplace supply; white-label copies show the copy owner's booked
  prices only (bookings are tenant+itinerary scoped). No new surface.
- **II. Agent Experience Is the Wedge**: PASS. The client-facing branded output now carries
  the agent's actual client prices ("your brand, your prices" becomes true). No
  time-to-client-ready regression: share flow unchanged.
- **III. Budget-Aware AI**: N/A — no planner change. The draft's stored estimate semantics
  are preserved (US3).
- **IV. Canonical Itinerary Schema**: PASS. The document is NOT modified — no schema change,
  no version bump, **no migration note required** (recorded explicitly: this plan's storage
  decision keeps realized money in booking records; the document read path is read-only per
  spec 010 FR-011). The rejected book-time-stamping alternative is documented in research D1.
- **V. Integrate Supply, Don't Contract It**: PASS. No supplier shapes anywhere near this
  change; the projection consumes platform booking records only.
- **VI. Trust, Provenance & Revenue-Share Integrity**: PASS. The trust boundary allowlist is
  unchanged (the one new value crossing is the booked sell amount — already a client-facing
  value by definition); net/markup/supplier fields stay structurally absent, and the L1
  redaction suite + L3 leaf-scan keep pinning that. Money-adjacent read path → L3 tests on
  real Postgres are mandatory and planned (red-witness first).

## Project Structure

### Documentation (this feature)

```text
specs/013-booked-price-fidelity/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D7
├── data-model.md        # Phase 1 — projection inputs/outputs (no new entities)
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   └── client-view-projection.md   # Amended payload semantics
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/api/src/services/client-view.ts        # component read + booked-price projection
packages/api/src/__tests__/client-view-projection.test.ts   # L1: projection prefers booked sell
packages/api/src/__tests__/l3-client-view.test.ts           # L3: book @2200bps → view == ledger (red-first)
apps/web/app/(client-view)/view/[token]/page.tsx # estimated-vs-confirmed presentation
apps/web/lib/client-view.ts                      # label helper (if extraction threshold met)
tests/e2e/client-view.spec.ts (or sibling)       # booked price + estimate label visible
scenarios/incubating/reseller-books-copy-live/scenario.mjs  # observation → hard assertion
specs/005-budget-quote-book/spec.md              # amendment note (draft-only placeholder)
specs/010-client-view-share/spec.md              # FR-008/Assumptions amendment notes
```

**Structure Decision**: Existing monorepo layout; no new packages, no new routes. The
projection change lives entirely in the API service layer (packages/api) with presentation
in the existing client-view page.

## Design Sketch (Phase 1 condensed)

1. **Service read** (`resolveShareLink`): the `booking_component` select gains `sellMinor`
   and `currency`; build `bookedPriceByItemId: Map<string, Money>` via domain `money()` from
   the component's OWN recorded currency (a corrupted cross-currency row then fails loudly in
   the domain `addMoney` fold — research D3 — instead of rendering a wrong total).
2. **Projection** (`toClientItineraryView`): signature takes the map (replacing the bare
   `bookedItemIds` set — the map's key set is the booked set, one argument, no drift between
   "booked" and "has booked price"); per item, `sellMinor = bookedPrice ?? document
   sellPrice ?? null`; the fold sums exactly what is shown (FR-002; SC-001's zero-delta is
   then structural).
3. **Page**: booked items keep the `Booked` badge (spec 010 FR-009) and their price renders
   as the confirmed price; un-booked priced items gain an explicit `estimate` marker; the
   trip total line states when it includes estimates (derivation is boolean presentation
   logic, not money math — research D2).
4. **Spec amendments**: annotate (never silently reword) — spec 010 Assumptions bullet +
   FR-008 gain "Amended by spec 013 (2026-07-11)" notes; spec 005 Assumptions gains the
   draft-only-placeholder note. Original text preserved as history (spec-gap-0001 precedent).
5. **Scenario**: bring `scenarios/incubating/reseller-books-copy-live/` onto this branch
   from the iter-3 ideate auto-commit (d0a9fdc — research D6) and promote the price-fidelity
   observation to `check(viewBookedSum === ledgerSellSum)`.

## Complexity Tracking

No constitution violations. No deviations to justify. (The one judgment call — payload shape
unchanged vs adding a confirmed/estimate flag — is argued in research D2 and is the simpler
option.)
