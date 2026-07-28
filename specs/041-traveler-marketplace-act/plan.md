# Implementation Plan: Traveler acts on a marketplace itinerary

**Branch**: `kitchen/fix-goal-marketplace-fork-whitelabel-traveler-act` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/041-traveler-marketplace-act/spec.md`

## Summary

A signed-in traveler browses agent-listed marketplace trips on the consumer surface, forks one
into their own working copy, then self-books it (paying the selling agency's established sell
price) or requests an agent to arrange it. The design **maximally reuses** the already-shipped
traveler money paths — `clientView.selfBook` (spec 036) and `requestHandoff` (spec 022) —
reached from the existing `/view/[token]` trip flow. The only new server code is (1) a
traveler-safe cross-tenant **marketplace browse** projection, (2) a **fork** service that copies
the listed itinerary into a **seller-agency-owned** copy + mints a share link + attaches the
traveler + records a `marketplace_fork` bolt-on row, and (3) a one-line **fork-aware markup
fallback** in `deriveMarkupBps` so a fork copy books at the *source listing's* established
markup. No new money math, no canonical-schema change, no new take-rate.

## Technical Context

**Language/Version**: TypeScript (Node 20), pnpm turborepo

**Primary Dependencies**: tRPC (`packages/api`), Drizzle/Postgres (`packages/db`), pure domain
money (`packages/domain`), marketplace flows (`packages/marketplace`), Next.js App Router
(`apps/web`), Better Auth (org-less traveler identity, spec 030)

**Storage**: Postgres via Drizzle. Reused tables: `marketplace_listing`, `itinerary`,
`itinerary_share_link`, `client_trip_link`, `booking_quote`, `booking_component`,
`markup_ledger`, `agency_vetting`, `organization`. New additive bolt-on table:
`marketplace_fork`.

**Testing**: Vitest (L1/L2), L3 integration on real Postgres (`packages/api/src/__tests__/l3-*`),
Playwright e2e (`tests/e2e`), live compose QA (INV-027)

**Target Platform**: docker-compose web (Next.js standalone) + Postgres

**Project Type**: Web application (Next.js app + tRPC API + Drizzle DB, ports-and-adapters)

**Performance Goals**: Browse is one cross-tenant read + a batched booking-component lookup;
fork is one transaction; self-book reuses the existing quote→book path unchanged.

**Constraints**: INV-004 (tenant scoping), INV-010 (money math only in `packages/domain`),
INV-011 (state conservation on failure), INV-020 (client-facing figures only),
INV-024 (traveler cannot act as an agency). **No canonical `SCHEMA_VERSION` bump.** No supplier
API shapes outside the supply adapter.

**Scale/Scope**: One new tRPC sub-router (`clientView.marketplace`: `browse` + `fork`), one new
service module, one new bolt-on table + migration, one `deriveMarkupBps` extension, one real
`/view/marketplace` page (replacing a stub), L3 + e2e tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Operator authorization**: This work is the operator-ratified `MARKETPLACE-FORK-SEMANTICS`
"build safe-v0" decision (OPERATOR-DESK 2026-07-27; GOAL.md 2026-07-27). Bounds (a) fork =
agency-owned copy, (b) book as-is at existing sell price / no new take-rate, are implemented
exactly; bounds (c) three-way resale payout and (d) joinable-departure hardening are **deferred**
(named in spec Out of Scope). Per DIRECTIVE §2 the additive bolt-on table + fork money behavior
are **build-now, ratify-at-merge** (SCHEMA-GATE-78 / GROUP-TRIPS-AMEND precedent); a desk row is
filed and the PR stays operator-gated at merge.

| Principle | Assessment |
|-----------|------------|
| **I. Marketplace-First** | ✅ Directly deepens marketplace liquidity: a traveler acts on agent-listed supply (self-book funnels GBV to the agent; request-agent funnels demand into the agent network). No standalone-planner drift. |
| **II. Agent Experience Is the Wedge** | ✅ The client-facing surface stays white-labeled to the *selling* agency; the traveler never sees TripForge economics or another brand. Reuses the redacted `/view/[token]` surface (INV-020). |
| **III. Budget-Aware AI** | ➖ N/A — no planner/AI output changed; the fork is a faithful copy of an existing priced itinerary. |
| **IV. Canonical Itinerary Schema** | ✅ **No schema change.** The fork copy is the *same* versioned itinerary entity (re-validated via `parseItinerary` on write). `marketplace_fork` is a bolt-on over an itinerary (the `traveler_group`/`group_departure`/`marketplace_listing` pattern), NOT a canonical-schema field. `SCHEMA_VERSION` unchanged. |
| **V. Integrate Supply, Don't Contract It** | ✅ Booking reuses `quoteItinerary`/`bookItinerary`; no supplier API shape touched outside the adapter. |
| **VI. Trust/Provenance/Revenue-Share Integrity** | ✅ **Money path stays inside existing math.** No new take-rate on traveler booking; the selling agency keeps its markup via the unchanged `markup_ledger`; the two-way marketplace split is untouched (no resale here). Tenant is the seller agency resolved from the share link (INV-004/024), never the traveler session; the traveler cannot set markup or pay net (FR-011 default-never-zero). Conservation on failure inherited from `bookItinerary` (INV-011), asserted by an L3 test. The three-way original-seller payout stays deferred (bound c). |

**Money-path testing gate**: L3 integration test on real Postgres asserting (1) fork copy books
at the *source* seller markup (not the default) with `markup_ledger` recording the margin, (2)
forced component failure charges nothing and conserves state, (3) every money row carries the
seller agency id. **Result: PASS** (no unjustified violations; Complexity Tracking empty).

## Project Structure

### Documentation (this feature)

```text
specs/041-traveler-marketplace-act/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (tRPC procedure contracts)
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
packages/db/src/
├── schema-marketplace-fork.ts     # NEW: marketplace_fork bolt-on table
├── schema.ts                      # extend: assemble the new table
└── index.ts                       # extend: export marketplaceFork

packages/marketplace/src/
├── traveler-fork.ts               # NEW: pure fork-copy transform (mirrors white-label.ts)
├── traveler-browse.ts             # NEW: traveler-safe listing projection (cross-tenant read)
└── index.ts                       # extend: export the new flows

packages/api/src/
├── services/marketplace-traveler.ts   # NEW: forkListingForTraveler + browseMarketplaceForTraveler orchestrators
├── services/booking/self-book.ts      # extend: fork-aware deriveMarkupBps fallback
└── routers/client-view.ts             # extend: clientView.marketplace = { browse, fork }

apps/web/app/(client-view)/view/marketplace/
├── page.tsx                       # replace stub: real server-rendered browse
├── marketplace-browse.tsx         # NEW: traveler browse grid (client component)
└── fork-action.tsx                # NEW: "Plan & book this trip" fork button → /view/[token]

tests/
├── packages/api/src/__tests__/l3-traveler-marketplace-fork.test.ts   # NEW L3 money path
└── e2e/traveler-marketplace-journey.spec.ts                          # NEW e2e journey
```

**Structure Decision**: Ports-and-adapters is preserved. Pure transforms (`traveler-fork.ts`,
`traveler-browse.ts`) live in `packages/marketplace` (no I/O); the DB-touching orchestration
lives in `packages/api/src/services`; the tRPC surface is a new `clientView.marketplace`
sub-router (traveler surface, matching `clientView.groups`); the UI replaces the existing
`/view/marketplace` coming-soon stub. Downstream self-book/request-agent are reused verbatim
via `/view/[token]`.

## Complexity Tracking

> No Constitution Check violations — this section is intentionally empty.
