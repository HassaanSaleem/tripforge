# Implementation Plan: Booking Flow UI — Quote → Review → Book

**Branch**: `kitchen/fix-seed-0009b-booking-ui` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-booking-flow-ui/spec.md`

## Summary

Make the quote-then-book money path visible in the browser: below a rendered draft
itinerary on the workspace planner surface (spec 008), a verified agent sets a markup
percentage, requests firm quotes via the existing agent-gated
`workspace.booking.quote` mutation, reviews the held prices (net rate, sell price,
markup, hold expiry — per item, with typed per-item failures mapped to human
messages), selects holds, and books them via the existing `workspace.booking.book`
mutation, seeing the confirmation (overall status, booking reference, per-component
supplier references or typed failure reasons). Zero server-side changes: no new
procedures, no contract changes, no schema or money-path changes — UI + client
wiring only, on the established typed browser tRPC client and the seed-0009s theme
kit.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict), React 19, Next.js 15 (app router)

**Primary Dependencies**: `@trpc/client@11.18.0` (already a dependency of
`apps/web` since spec 008 — no new dependencies); `@tripforge/api` (type-only
`AppRouter` import, already in place); existing Better Auth session cookie (no auth
changes)

**Storage**: none added — holds, bookings, components, and ledger rows are already
persisted server-side (spec 005); this UI renders them

**Testing**: Vitest L1 for the new pure view-logic helpers (markup percent →
basis-point mapping, quote/book failure → message mapping, hold-expiry display
formatting) under the existing `apps/web/lib/**/*.test.ts` include (no
vitest.config change needed); existing L2/L3 booking-flow tests (spec 005 —
9 L3 money-path tests against real Postgres) remain the authoritative server gate,
untouched; Playwright e2e (L4) adds a sign-up → draft → quote → book → confirmed
journey against the built compose image (INV-027)

**Target Platform**: browser (client component inside the existing `(workspace)`
route group page); serverless-compatible — no new server handlers, no in-process
state (INV-028)

**Project Type**: web app (pnpm/turborepo monorepo, `apps/web`)

**Performance Goals**: quote/book round-trips are bounded server calls against the
deterministic sandbox engine (no LLM in the loop); the UI adds two POSTs and a
render — no client-side data recomputation

**Constraints**: INV-018 (single tRPC surface — the existing browser client over
the `/api/trpc` mount); INV-023/024 (authorization per procedure unchanged; page
gate is UX only); INV-010 + FR-007 (zero client-side money arithmetic — display
formatting of exact integer minor units only; the single permitted numeric input
conversion is markup percent → integer basis points); INV-006 surfaced (hold expiry
shown to the agent; expired holds are refused server-side and mapped to a message);
INV-016 (confirmation stays on screen; nothing auto-navigates); INV-020 untouched
(workspace surface only); INV-028 (no new server handler; quote/book are bounded
non-LLM round-trips, so the seed-0014 streaming deferral is not implicated)

**Scale/Scope**: one existing page section extended (the planner's drafted state),
one new client component, one new pure view-logic helper module + unit tests, one
generalized transport-error helper (shared with the planner), one e2e spec,
additive theme-kit CSS

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Marketplace-First | PASS | Completes the Build→Book wedge in the browser — the demo path's money step (seed-0009a → THIS → 0009c/d). Booked trips are what the marketplace trades; GBV is the North Star and this surface is where it becomes visible. No consumer-surface (P2) code. |
| II. Agent Experience Is the Wedge | PASS | Inline net-rate booking with markup control IS the professional-surface hook (net rate, sell price, margin lever on one screen). Extends the existing workspace surface; regresses nothing (planner form and draft rendering unchanged; US4/FR-009 keeps the non-agent prompt byte-identical). |
| III. Budget-Aware AI, Priced Against Reality | PASS | Proves the draft is genuinely bookable: live-held prices with expiry, booked against the same inventory that priced the plan. All prices platform-computed; the UI renders them as received (FR-007). Plan→book conversion — the principle's own metric — becomes exercisable end-to-end in a browser; the server already emits `booking_confirmed` PMF events in the book transaction (spec 005). |
| IV. Canonical Itinerary Schema | PASS | The canonical document is read-only here (item titles/kinds joined by item id for display). Never forked, extended, or re-computed. No schema change ⇒ no migration note required. |
| V. Integrate Supply, Don't Contract It | PASS | No supplier API shapes touched; the UI consumes only the typed quote/book outcome values from the existing procedures. Quote-then-book with hold/expiry + re-quote-on-expiry — the §9.2 realities — are surfaced to the user exactly as the backend models them (hold expiry visible, `quote_expired` mapped to a re-quote invitation, partial failure rendered per component). |
| VI. Trust, Provenance & Revenue-Share Integrity | PASS | No money path is created or modified; the UI performs zero money arithmetic (FR-007). The existing L3 money-path tests (conservation, claim discipline, item exclusivity — spec 005 + seed-0015) remain authoritative and untouched. Booking state shown only from the platform's own responses (FR-008 — never inferred client-side). |
| Non-Goals / MVP Scope Discipline | PASS | P0 agent-side surface. No flights booking (flights stay a budget anchor — no flight component exists to book), no ride-hailing/Airbnb/consumer-planner code, no P1+ items. |
| PMF instrumentation | PASS (no change) | `booking_confirmed` (GBV) is already emitted server-side inside the recording transaction (spec 005 FR-013); this UI adds no new business action requiring events. |

**Pre-research gate: PASS** (no violations, no Complexity Tracking entries).

**Post-design re-check (after Phase 1): PASS** — design artifacts introduce no new
server surface, no schema change, no money math; the only cross-module delta is a
generalized transport-error helper inside `apps/web/lib` (presentation layer,
research D6) and additive theme CSS.

## Project Structure

### Documentation (this feature)

```text
specs/009-booking-flow-ui/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output (decisions D1–D10)
├── data-model.md        # Phase 1 output (view-model projections + message mapping tables)
├── quickstart.md        # Phase 1 output (live validation guide)
├── contracts/
│   └── booking-ui.md    # Phase 1 output (consumed API contract + UI rendering contract)
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/web/
├── lib/
│   ├── trpc/
│   │   └── client.ts                         # MODIFIED: + inferred Quote/Book input & output types
│   │                                         #   (same inference pattern as DraftInput/DraftOutput)
│   ├── transport-error.ts                    # NEW: generalized TRPCClientError → human message helper
│   │                                         #   (research D6; planner-form delegates, strings unchanged)
│   ├── planner-form.ts                       # MODIFIED: draftErrorMessage delegates to transport-error
│   │                                         #   (public API + returned strings identical)
│   ├── booking-flow.ts                       # NEW: pure view logic — markup % → bps mapping+validation,
│   │                                         #   quote-item/book-component failure → message mapping,
│   │                                         #   book-status labels, hold-expiry display formatting,
│   │                                         #   itinerary item-metadata join (id → title/kind)
│   └── __tests__/
│       ├── planner-form.test.ts              # existing — must stay green unchanged
│       └── booking-flow.test.ts              # NEW: L1 unit tests for the helpers
└── app/(workspace)/workspace/
    ├── planner.tsx                           # MODIFIED: drafted state composes <BookingFlow>
    └── booking-flow.tsx                      # NEW: client component — markup input, quote action,
                                              #   review list (held prices/expiry/failures, selection),
                                              #   book action, confirmation panel

apps/web/app/globals.css                      # MODIFIED: additive .tf-booking-* kit styles (presentation only)

tests/e2e/
└── booking-journey.spec.ts                   # NEW: L4 sign-up → draft → quote → book → confirmed journey
```

**Structure Decision**: All new code lives in `apps/web` (presentation layer,
INV-017: apps → packages only — the client imports `AppRouter` types from
`@tripforge/api` and nothing deeper). The booking flow is a client component
composed by the existing `Planner` client component's drafted state, so it can
only ever render inside a verified agent's drafted plan — the spec 007 identity
gate and membership prompt stay exactly as shipped (FR-009), and the flow resets
naturally when a new draft replaces the old one (keyed by itinerary id).

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.
