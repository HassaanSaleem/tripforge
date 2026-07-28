# Implementation Plan: Traveler Self-Drive Booking

**Branch**: `kitchen/fix-goal-consumer-selfbook-selfdrive` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/036-traveler-self-book/spec.md`

## Summary

Replace the client-view trip-fork "Book it myself" confirmation-only stub with a
real self-drive booking. A signed-in traveler holding a share token invokes a new
token-authorized `clientView.selfBook` procedure that resolves the itinerary's
owning agency from the share link and runs the **existing** quote-then-book money
path (`quoteItinerary` + `bookItinerary`) scoped to that agency, with markup
derived server-side. Money attribution, state-conservation, and item-level
exclusivity are inherited unchanged from the agent path; the traveler-facing
result is redacted like every other client-view payload. The UI adds a
review-then-confirm flow surfacing the real sourced items being booked, honest
flight deep-links, and sourced-only advisory pointers.

**Technical approach**: widen the three booking-service functions from
`AgentSessionContext` to a minimal `BookingActor = Pick<AgentSessionContext,
"agencyId" | "userId">` (both paths already read only those two fields — a pure,
behavior-preserving type widening), add a `selfBookItinerary` orchestrator that
synthesizes a `BookingActor` from the share-link's agency + the traveler's
`userId`, and mount it on `clientView` as a `protectedProcedure`. No schema
change, no new table/column, no new revenue-share or client-ownership record.

## Technical Context

**Language/Version**: TypeScript 5.x (Node 20), pnpm workspace monorepo

**Primary Dependencies**: tRPC, Drizzle ORM (Postgres), Next.js (App Router,
server components), Zod, `@tripforge/domain` (pure money math), the
supply-adapter sandbox ports

**Storage**: Postgres via Drizzle — reuses existing `booking`,
`booking_component`, `booking_quote`, `markup_ledger`, `pmf_event`,
`itinerary_share_link` tables. **No migration.**

**Testing**: Vitest. L1/L2 unit + L3 integration (`describe.skipIf(!DATABASE_URL)`
against the compose Postgres). New L3 test `l3-traveler-self-book.test.ts`.

**Target Platform**: Web (consumer/client-view surface); the same tRPC procedure
a future mobile client consumes (INV-018).

**Project Type**: Web application (Next.js app + tRPC API package + domain/db/
supply-adapter packages).

**Performance Goals**: Self-book completes within normal interactive latency;
quote+book runs server-side in one call. No new N+1 query patterns.

**Constraints**: Money path — INV-011 state conservation on failure branches;
INV-010 money math only in `packages/domain`; INV-006 quote-then-book with
expiry; INV-020 client-facing redaction; INV-024 surface separation; INV-028 no
in-process cross-request state (procedure reads the DB fresh per request).

**Scale/Scope**: One new procedure + one orchestrator service + one type widening
of three functions + trip-fork UI flow + one L3 test + update the standing
regression scenario. No new packages.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**I. Marketplace-First** — ✅ PASS. The consumer surface's self-drive fork is a
P2 pillar that feeds the marketplace (booked GBV flows through agency-owned
itineraries; the request-an-agent fork remains). Operator-authorized for this
campaign (DIRECTIVE §6, GOAL.md D2.4 — P2 pull-forward). Self-book keeps the
booking attributed to the owning agency, reinforcing the agent-connected model
rather than a standalone planner.

**II. Agent Experience Is the Wedge** — ✅ PASS. The client-facing output stays
white-labeled to the agency (INV-020); no platform branding leaks. The agent
remains the author of record; the traveler acts on the agent's shared trip.

**III. Budget-Aware AI, Priced Against Reality** — ✅ PASS. Every self-booked
item is priced live through the same quote path against real supply-adapter
offers. No static/unpriced output. No fabricated content: recommendations trace
to real supplier offers; advisories are sourced or deferred, never invented
(Compliance & Content Sourcing honored — FR-011/FR-012).

**IV. Canonical Itinerary Schema** — ✅ PASS. **No schema change.** The itinerary
document flows unchanged; self-book reads it and writes existing money-path rows.
No versioned-migration trigger. (A schema version bump would be ALWAYS-HALT — not
required here.)

**V. Integrate Supply, Don't Contract It** — ✅ PASS. Reuses the existing
supply-adapter boundary and the quote-then-book path (hold/expiry, re-quote on
expiry, multi-supplier partial-failure, merchant-of-record per component). No
supplier API shapes leak past the adapter. Flights stay deep-link only (INV-008).
No new adapter, no direct contracting.

**VI. Trust, Provenance & Revenue-Share Integrity** — ✅ PASS. Money attribution
is byte-identical to the agent path: booking/component/ledger carry the owning
`agencyId`; markup = sell − net via pure `@tripforge/domain` math (INV-010);
PMF `booking_confirmed` emitted (INV-014 GBV). **No new revenue-share obligation
and no client-ownership change** — the itinerary and its bookings remain the
agency's; the traveler is the actor, not a new owner. Money path covered by an L3
integration test with failure-path conservation assertions (release gate). A
revenue-share/client-ownership semantics change would be ALWAYS-HALT — this
feature deliberately introduces none.

**Roadmap discipline** — ✅ PASS. Consumer self-drive is P2, explicitly
pull-forward-authorized for this campaign (DIRECTIVE §6). No non-goal work (no
ride-hailing, no Airbnb, no flights merchant-of-record, no generic planner).

**ALWAYS-HALT scan** — no constitution amendment, no schema version bump, no
revenue-share/client-ownership semantics change, no gate change, no deploy, no
push outside the PR pipeline. **Nothing on the halt list is triggered.** →
proceed autonomously.

**Result**: PASS (initial). Re-checked post-design below.

## Project Structure

### Documentation (this feature)

```text
specs/036-traveler-self-book/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 — design decisions
├── data-model.md        # Phase 1 — entities touched (no new tables)
├── quickstart.md        # Phase 1 — how to validate
├── contracts/
│   └── self-book.md     # clientView.selfBook contract
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
packages/api/src/
├── trpc.ts                                # (unchanged) BookingActor is a subset of AgentSessionContext
├── services/
│   ├── booking/
│   │   ├── shared.ts                       # loadItinerary(actor: BookingActor)  ← widen param
│   │   ├── quote.ts                        # quoteItinerary(actor: BookingActor) ← widen param
│   │   ├── book.ts                         # bookItinerary(actor: BookingActor)  ← widen param
│   │   ├── actor.ts                        # NEW: BookingActor type
│   │   └── self-book.ts                    # NEW: selfBookItinerary orchestrator (resolve token→agency, derive markup, quote+book, redact)
│   ├── client-view.ts                      # export findShareLinkByToken as resolveShareLinkTenant (token→{agencyId,itineraryId})
│   └── booking.ts                          # barrel: re-export selfBookItinerary + types
├── routers/
│   ├── booking.ts                          # (unchanged) agent path passes ctx.session (AgentSessionContext)
│   └── client-view.ts                      # NEW: clientView.selfBook (protectedProcedure + token)
└── __tests__/
    └── l3-traveler-self-book.test.ts       # NEW: L3 money-path + failure conservation

apps/web/app/(client-view)/view/[token]/
├── trip-fork.tsx                           # self-drive branch → review-then-confirm real self-book
└── page.tsx                                # pass the client view (items) down for the review screen

apps/web/lib/
└── client-view.ts                          # (maybe) small helpers for review-line formatting

scenarios/incubating/traveler-self-book-attempt/
└── scenario.mjs                            # UPDATE: gap → seam-works (self-book succeeds; conservation)
```

**Structure Decision**: Web application. All money logic stays inside
`packages/api/src/services/booking/*` (money math delegated to
`@tripforge/domain`); the new procedure is mounted on the existing `clientView`
router; the UI change is confined to the `(client-view)` route group. No new
package, no new table.

## Complexity Tracking

> No Constitution Check violations. This section is intentionally empty.

The one design choice worth noting (not a violation): widening the booking
services' parameter from `AgentSessionContext` to `BookingActor` rather than
synthesizing a fake `AgentSessionContext` for the traveler. This is the *simpler*
and cleaner option — it expresses exactly what the money path uses (`agencyId` +
`userId`), avoids fabricating an `agencyRole` the traveler doesn't have, and keeps
the agent path a structural subtype (zero behavior change). Rejected alternative:
a fake agent session (smell: pretends the traveler is an agency member; a future
reader could add an `agencyRole` check and silently grant travelers admin power).
