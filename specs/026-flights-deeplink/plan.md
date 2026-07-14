# Implementation Plan: Flights Card — Indicative Options + Deep-Link Handoff

**Branch**: `026-flights-deeplink` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-flights-deeplink/spec.md`

## Summary

Add a read-only "Flights" card to the trip result view (both the freshly-drafted
result and a reopened saved trip) showing 2-3 deterministic, seeded indicative
flight options (airline, indicative times, indicative price) for the trip's
destination and dates, plus a single deep-link action that opens an external
flight-search URL in a new tab. No booking, no payment, no canonical schema
change, no new persistence, no new tRPC procedure — purely a pure `packages/domain`
generator function plus a new presentational component wired into the two
existing call sites that already have (or can cheaply get) destination/dates.

## Technical Context

**Language/Version**: TypeScript 5.x (existing monorepo toolchain, no change)

**Primary Dependencies**: React 19 / Next.js (apps/web), tRPC (existing, no new
procedure), Zod (existing), Vitest (unit tests)

**Storage**: N/A — no new persistence. Reads the already-persisted `tripRequest`
(destination/checkIn/checkOut) that `workspace.itinerary.get` already returns
(`packages/api/src/services/booking/overview.ts`), and the already-computed
`flightsTransport` budget allocation already present on the drafted/loaded
itinerary's `pricing.categories` / `fit.categories`.

**Testing**: Vitest (L1, `packages/domain`), existing Playwright e2e specs
extended with one assertion, Live Test & Fix (INV-027) browser journey.

**Target Platform**: Web (apps/web, Next.js workspace route group). No mobile
change in this cycle (not part of the ticket's acceptance criteria).

**Project Type**: Web application (existing Next.js + tRPC monorepo)

**Performance Goals**: N/A — pure, synchronous, in-memory generation; no
network call, no added latency to any existing request.

**Constraints**: No canonical itinerary schema change (ALWAYS-HALT item per
DIRECTIVE.md if triggered — this design avoids it entirely, see Constitution
Check). No new money math (Constitution VI / INV-009/010 scope only applies to
money-moving paths; this feature performs zero money computation, only reads
an existing `Money` value for display).

**Scale/Scope**: One new pure module (`packages/domain/src/flights.ts`), one
new presentational component (`apps/web/app/(workspace)/workspace/flights-card.tsx`),
small additive wiring changes at the two existing call sites.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle V (Integrate Supply, Don't Contract It)** — explicitly names
  flights as "deep-link only at first ... flights are the budget anchor, not a
  profit line." This feature is a direct, literal implementation of that
  sentence. PASS.
- **Non-Goals** — "No merchant-of-record for flights early." This feature adds
  no merchant/payment path; the only action is opening an external URL. PASS.
- **Principle IV (Canonical Itinerary Schema)** — no field is added to
  `ItinerarySchema`/`DaySchema`/`ItemSchema`; no `SCHEMA_VERSION` bump; no
  migration note required. Destination/dates are read from the already-existing
  `tripRequest` column (`packages/db/src/schema-itinerary.ts`), already exposed
  by `workspace.itinerary.get`. PASS.
- **Principle VI (Trust, Provenance & Revenue-Share Integrity) / money-path
  testing** — this feature performs no money computation and moves no money;
  it displays an already-computed `Money` value read-only. Not a "money path"
  as the constitution defines it (payments, take-rate, booking margin,
  commission capture, consumer handoff fees) — no new L3 money-conservation
  test is required. A standard L1 unit test on the domain generator plus the
  existing e2e/Live-Test coverage is sufficient. PASS.
- **Principle V (adapter boundary)** — no supplier API is integrated; the
  generator is local/seeded, so no `packages/supply-adapter` port is needed
  (there is nothing to adapt — no real flight-search vendor is called). A new
  `FlightPort` would be speculative abstraction for a feature that will never
  book anything; simplicity default (Development Workflow) favors a plain pure
  function. PASS.
- **Simplicity default / existing-pattern conformance** — the pure generator
  lives in `apps/web/lib/flights.ts` (client-view pure logic), matching the
  established convention (`planner-form.ts`, `basis-points.ts`) rather than
  introducing the repo's first `apps/web` → `packages/domain` import for a
  single low-priority ticket (research.md documents this reconsideration).
  PASS.
- **MVP Scope Discipline** — deep-link flights is explicitly a P0/P2-adjacent
  budget-anchor requirement already named in Principle V, not a P1+ item.
  PASS.

No violations. Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/026-flights-deeplink/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

No `contracts/` directory: this feature adds no new tRPC procedure, HTTP route,
or other externally-exposed interface — the "contract" is a pure function
signature within `apps/web/lib`, documented in `data-model.md` instead.

### Source Code (repository root)

```text
apps/web/lib/
├── flights.ts                     # NEW — pure indicative-options + deep-link-url generator
└── __tests__/
    └── flights.test.ts            # NEW — L1 unit tests (determinism, distinct per destination)

apps/web/app/(workspace)/workspace/
├── flights-card.tsx               # NEW — presentational card component
├── planner.tsx                    # EXTEND — thread tripRequest into "drafted" view phase; render <FlightsCard>
└── itinerary-list.tsx             # EXTEND — destructure overview.tripRequest; render <FlightsCard>

tests/e2e/
└── <existing planner/trips spec>  # EXTEND — one assertion that the flights card + deep-link render
```

**Structure Decision**: Reuses the existing `apps/web/lib` (pure client-view
logic) and `apps/web/app/(workspace)/workspace` layers exactly as-is — no new
package, no new app, no new route, no new `packages/domain` → `apps/web`
import precedent (research.md). The two existing itinerary-detail call sites
(`planner.tsx` DraftResult, `itinerary-list.tsx` reopened-trip detail) already
render `<ItineraryDays>` side by side; `<FlightsCard>` is added next to it in
both places, fed by data each call site already has or can read from a
response it already receives.

## Complexity Tracking

*No Constitution Check violations — section not needed.*
