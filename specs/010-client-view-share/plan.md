# Implementation Plan: Client-View UI — Shared Itinerary with Agency White-Label Branding

**Branch**: `kitchen/fix-seed-0009c-client-view-ui` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-client-view-share/spec.md`

## Summary

Turn the `(client-view)/view` placeholder into the real traveler-facing surface: an
agent shares an itinerary from the workspace (new agent-gated
`workspace.itinerary.share` mutation minting one durable, unguessable link per
itinerary), and an anonymous traveler opens `/view/{token}` to see a read-only,
agency-branded, day-by-day itinerary with sell prices and booked marks. The crux is a
**server-side allowlist projection** (`ClientItineraryView`): the client surface is
served a redacted view that structurally cannot contain net rates, markup, budget
allocations, trip-request context, supplier references, or provenance — enforced by
construction and pinned by tests against the full payload, not just rendered pixels.
White-label integrity (INV-020) extends to the tokenized page: agency name as the
brand carrier in body + tab title, platform naming absent everywhere, and the existing
trust-boundary e2e stays green untouched.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict), React 19, Next.js 15 (app router)

**Primary Dependencies**: no new dependencies. Existing: `@trpc/server`/`@trpc/client`
11.x (procedures + typed browser client), Drizzle + Postgres (`packages/db`),
canonical schema (`packages/itinerary-schema`), pure money math (`packages/domain` —
`addMoney` reused for the server-computed trip total), Better Auth session (share
mutation only; the client view is anonymous).

**Storage**: one new tenant-owned Postgres table `itinerary_share_link` (token PK =
`gen_random_uuid()`, `agency_id`, `itinerary_id` UNIQUE, `created_at`). This is a DB
schema addition, **not** a canonical itinerary schema change — the jsonb document and
its versioned shape are untouched (no version bump, no migration note, QS3-4
precedent). The compose `migrate` service applies it via the existing
`drizzle-kit push` stage.

**Testing**: Vitest L1 for the pure projection (redaction allowlist, total fold,
unpriced/empty edge cases) and the share-URL/error view helpers; L3 against real
Postgres (env-gated `DATABASE_URL`, l3-marketplace pattern) for share create /
idempotent re-share / concurrent one-row race / cross-tenant refusal / unknown token /
booked marks / full-payload confidentiality scan; Playwright e2e (L4) drives sign-up →
draft → share → open link in a **fresh anonymous browser context** with INV-020
negatives on the tokenized page; existing `tests/e2e/trust-boundary.spec.ts` and
`smoke.spec.ts` stay green unchanged; live smoke (`tests/integration/smoke.mjs`) gains
share → anonymous-resolve checks.

**Target Platform**: browser. The tokenized page is a server component (read-only, no
client JS needed for rendering); the share control is a small client component inside
the existing workspace planner. Serverless-correct (INV-028): the share link is a
Postgres row; resolution is a fresh per-request read (`force-dynamic`, no caching of
private views).

**Project Type**: web app (pnpm/turborepo monorepo, `apps/web` + `packages/*`)

**Performance Goals**: one bounded DB read path per client-view request (share-link →
itinerary → booked item ids); no LLM, no supplier calls, no client-side data
recomputation. SC-001 (<5 s first render on the demo stack) is comfortably within a
single SSR pass.

**Constraints**: INV-020 (agency brand only on the client surface — body, tab title,
metadata; enforced by e2e negatives on both `/view` and `/view/{token}`); INV-024
(client-view route group; no workspace affordances for any session); INV-023 (share
mutation behind `agentProcedure`; authorization never UI visibility); INV-004 (share
rows tenant-scoped; cross-tenant share → NOT_FOUND, no existence oracle); INV-018
(the view is served by a public tRPC procedure on the single app router; the server
component calls the same procedure via a server-side caller — mobile consumes the
identical contract later); INV-010 + FR-008 (trip total computed server-side with
domain `addMoney`; the page formats integers only); INV-001/Constitution IV (document
read-only; the projection is presentation output, never re-enters the platform);
INV-028 (no in-process state); FR-003 (≥120-bit token: uuid v4 = 122 random bits;
`robots: noindex` on the tokenized page).

**Scale/Scope**: one new DB table; one new api service module (share + resolve +
pure projection) with two router touchpoints (share mutation on the workspace
itinerary router, new public `clientView` router); one new dynamic route page +
metadata; one new client component in the planner; additive `.tf-client-*` CSS; one
new e2e spec; L1 + L3 test files; smoke additions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Marketplace-First | PASS | The white-label client output is what makes marketplace resale meaningful — a licensed/rebranded trip is ultimately delivered to a client under the reseller's brand, and the projection deliberately hides provenance from the traveler (the reseller's client-ownership protection, Constitution VI adoption thesis). Completes the operator demo path (planner → booking → **view** → marketplace). No consumer-surface (P2) code: no self-serve planner, no discovery feed — a read-only link the agent chooses to send. |
| II. Agent Experience Is the Wedge | PASS | Principle II names this exact deliverable: "the client-facing output (branded proposals, trip app) MUST always look like the agent's brand, never TripForge's — white-label presentation is a first-class requirement." This feature is that requirement, built on the .tf-* kit to the seed-0009s premium bar. Time-to-client-ready-itinerary improves (draft → one click → shareable URL); nothing regresses (planner/booking surfaces extended additively; `/view` placeholder behavior preserved). |
| III. Budget-Aware AI, Priced Against Reality | PASS | No AI change. The shared view renders the live-priced document the planner produced — priced, bookable output, not static suggestions. Sell prices and booked marks come from platform records; the page performs zero money arithmetic (domain `addMoney` computes the total server-side). |
| IV. Canonical Itinerary Schema | PASS | The document flows unchanged and is read-only here. `ClientItineraryView` is a redacted **presentation projection** that leaves the platform toward the traveler's browser and never re-enters any layer — not a fork or private extension of the itinerary model (the same relationship the booking UI's display join has to the document). No schema change ⇒ no version bump, no migration note. |
| V. Integrate Supply, Don't Contract It | PASS | No supplier API shapes touched anywhere; `supplyRef` (port + external id) is explicitly on the redaction exclude list, so supplier references cannot even reach the traveler's browser. |
| VI. Trust, Provenance & Revenue-Share Integrity | PASS | Trust enforced mechanically, not by policy: the allowlist projection makes net-rate/markup/provenance leakage structurally impossible and tests scan the full serialized payload (SC-003); share creation is tenant-scoped with no cross-tenant existence oracle; token space ≥120 bits with a neutral unavailable state. No money path is created or modified — the markup/take-rate ledgers and their L3 conservation suites are untouched. |
| Non-Goals / MVP Scope Discipline | PASS | P0 agent-side surface: the PRD's P0 success statement is "a client-ready **branded** itinerary" — this ships its delivery vehicle. Not the P2 consumer surface (no traveler accounts, no self-serve planning, no feed). No flights/ride-hailing/Airbnb code. Revocation/expiry deferred with an explicit follow-up note (spec Assumptions). |
| PMF instrumentation | PASS (no change) | Share/view are not among the mandated PMF metrics (GBV, take-rate per agent, resold ratio, plan→book conversion); no new business transaction is created. The PMF event vocabulary is closed and additive-by-SDD — deliberately not extended here. |

**Pre-research gate: PASS** (no violations, no Complexity Tracking entries).

**Post-design re-check (after Phase 1): PASS** — the design adds one leaf table, one
service + public router, and presentation; no supplier shapes, no money-path changes,
no canonical-schema delta. The one cross-layer addition (public `clientView` router)
exists precisely to keep INV-018's single-surface rule intact for the anonymous
traveler read.

## Project Structure

### Documentation (this feature)

```text
specs/010-client-view-share/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output (decisions D1–D11)
├── data-model.md        # Phase 1 output (share-link entity + ClientItineraryView projection)
├── quickstart.md        # Phase 1 output (live validation guide)
├── contracts/
│   └── client-view.md   # Phase 1 output (share + resolve procedure contracts, page contract)
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/db/src/
└── schema.ts                                  # MODIFIED: + itinerary_share_link table (leaf, tenant-owned)

packages/api/src/
├── services/client-view.ts                    # NEW: createShareLink (idempotent, tenant-scoped),
│                                              #   resolveShareLink (token → view | not_found),
│                                              #   toClientItineraryView (PURE allowlist projection + addMoney total)
├── routers/itinerary.ts                       # MODIFIED: + share mutation (agentProcedure)
├── routers/client-view.ts                     # NEW: public router — itinerary: publicProcedure(token) → view
├── routers/root.ts                            # MODIFIED: + clientView mount (public, outside workspace)
└── __tests__/
    ├── client-view-projection.test.ts         # NEW L1: allowlist redaction, total fold, edge cases
    └── l3-client-view.test.ts                 # NEW L3 (real Postgres): share/re-share/race/tenancy/
                                               #   unknown-token/booked-marks/full-payload confidentiality

apps/web/
├── lib/
│   ├── trpc/client.ts                         # MODIFIED: + inferred Share + ClientView types
│   ├── trpc/server.ts                         # MODIFIED: export server-side caller for server components
│   ├── share-control.ts                       # NEW: pure view logic — share path → absolute URL, error mapping
│   └── __tests__/share-control.test.ts        # NEW: L1 unit tests
└── app/
    ├── (workspace)/workspace/
    │   ├── planner.tsx                        # MODIFIED: drafted state composes <ShareControl>
    │   └── share-control.tsx                  # NEW: client component — share button, URL display, copy
    ├── (client-view)/view/[token]/page.tsx    # NEW: server component + generateMetadata (agency-branded
    │                                          #   title, robots noindex, force-dynamic)
    └── globals.css                            # MODIFIED: additive .tf-client-* styles (presentation only)

tests/e2e/
└── client-view-journey.spec.ts                # NEW L4: sign-up → draft → share → anonymous context opens
                                               #   /view/{token}; INV-020 negatives on the tokenized page

tests/integration/
└── smoke.mjs                                  # MODIFIED: + share → anonymous resolve → confidentiality checks
```

**Structure Decision**: The redaction boundary lives in `packages/api`'s service layer
(`client-view.ts`) — the same layer that already projects `itineraryOverview` — so the
public router is a thin wrapper and the projection is a pure, exhaustively unit-testable
function. `apps/web` stays presentation-only (INV-017: apps → packages): the tokenized
page renders whatever the projection returns and can never reach the raw document. The
share control composes into the planner's drafted state exactly as the booking flow
does (spec 009 precedent), so it exists only inside a verified agent's drafted plan.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.
