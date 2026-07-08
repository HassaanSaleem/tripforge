# Implementation Plan: Supply Adapter Port Family + Sandbox Mocks

**Branch**: `kitchen/fix-seed-0003-supply-adapter-ports` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-supply-adapter-ports/spec.md`

## Summary

Extend the existing `packages/supply-adapter` hotel-port pattern (seed-0001) in
place to the full P0 component family — hotel, activity, transfer, car rental —
and upgrade the shared verb semantics to the PRD §9.2/§9.4 quote-then-book
realities: quotes with explicit hold expiry + merchant-of-record, typed
quote/book/cancel outcomes (machine-readable failure reasons), expiry enforced
at book time, idempotent booking per quote, and port-level independence of
holds (one component's failure never touches a sibling's hold). Ship
deterministic, clock-injectable, stateful sandbox adapters for all four ports
(shared internal lifecycle engine + per-port fixtures, including a well-known
always-fails-booking fixture for partial-failure tests), one reusable L2
behavioral contract suite run against all four sandboxes, and composition-root
wiring in `packages/api` so handlers reach every port through the container.
No canonical-schema change (D-006); no new workspace/external dependencies.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict), Node >= 20, ESM (`"type": "module"`)

**Primary Dependencies**: `@tripforge/domain` (Money — already a dependency of
`@tripforge/supply-adapter`). Deliberately NO new dependencies: no zod in the
port layer (ports are compile-time contracts; zod validates at *untrusted*
boundaries — tRPC inputs and, later, real supplier HTTP responses inside their
adapters), no `@tripforge/shared` (see research D1), no external packages —
`pnpm-lock.yaml` stays byte-identical, keeping the frozen-lockfile Docker
build valid.

**Storage**: None. This feature persists nothing; live quotes exist only in
memory with an explicit expiry (INV-026 carve-out). Static-content
materialization into Postgres derived tables (INV-025) is contract-prepared
here (content/price separation) and lands with its first consumer (follow-up
ticket filed by this PR).

**Testing**: Vitest 2.1 via the single root config (discovers
`packages/**/src/**/*.test.ts`); the L2 contract suite lives in
`packages/supply-adapter/src/__tests__/`. Lint via root ESLint flat config;
boundaries machine-checked by dependency-cruiser (INV-017).

**Target Platform**: Node 20 library package consumed by the tRPC application
layer (and later the LLM tool loop, INV-013). Sandbox adapters hold
per-instance in-memory supplier state — fine for tests and the single-process
compose stack; the serverless deployment implication is seed-0005's concern
(research D10 records this explicitly).

**Project Type**: Library (workspace package) + composition-root wiring.

**Performance Goals**: N/A (in-memory, deterministic; test-time execution).

**Constraints**: Deterministic (no network, no randomness, injectable clock);
zero package.json/lockfile changes; no supplier API shapes outside the
package (INV-005); no canonical-schema change (D-006 / FR-012).

**Scale/Scope**: 4 ports × 4 verbs; ~9 source files + 6 test files in
`packages/supply-adapter`; 2 files touched in `packages/api`.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0 before Phase 0
research; re-evaluated after Phase 1 design — both PASS, no deviations.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Marketplace-First | PASS | Ports are the Book wedge that feeds the marketplace: every listed/resold trip's components become bookable through them. P0 component map only; nothing parity-driven. |
| II. Agent Experience Is the Wedge | PASS | No UI change; no regression to time-to-client-ready-itinerary (nothing user-facing gets slower — no runtime paths change behavior). Enables inline net-rate booking later. |
| III. Budget-Aware AI, Priced Against Reality | PASS | These ports are precisely what makes planner output priced against bookable inventory (INV-014); seed-0005's allocator pulls live options through them. Net rates as exact Money. |
| IV. Canonical Itinerary Schema | PASS | Schema byte-for-byte untouched (SC-006). `supplyRef.port` enum stays `[hotel, activity, transfer]`; car-rental linkage stays deferred behind an operator-gated bump (D-006). No itinerary-shaped type declared here. |
| V. Integrate Supply, Don't Contract It | PASS | The feature *implements* this principle: supplier-agnostic ports for the §9.3 P0 map, quote-then-book with hold/expiry + re-quote, multi-currency without implicit conversion, partial-failure guarantees, explicit merchant-of-record per component. No supplier shape outside the package (SC-004 grep). Flights excluded (INV-008). |
| VI. Trust, Provenance & Revenue-Share Integrity | PASS (scoped) | No money moves in this feature — no ledger, no payment, no take-rate; ports expose net rates only and do no money math (INV-010). Typed failure outcomes are what seed-0005's money-path L3 conservation tests will assert against. Money-path integration tests land with the first money-moving flow (seed-0005), per the constitution's own scoping ("money paths require integration tests before release" — no money path ships here). |
| Non-Goals | PASS | No flights port, no Airbnb, no ride-hailing. |
| MVP Scope Discipline | PASS | Exactly the P0 adapter items; real aggregators deferred behind the same ports (P0 text allows: "ONE bedbank + activities + transfers + car via aggregator adapters" — sandbox-first is the INV-019 local story). |
| Development Workflow | PASS | spec.md → plan.md → tasks.md in `specs/003-supply-adapter-ports/`; no schema migration note needed (no schema change); simplicity default honored (no DI framework, no speculative storage). |

**New invariant proposal**: none needed — this feature lands inside existing
INV-005/006/007/009/017/019 exactly as written.

## Project Structure

### Documentation (this feature)

```text
specs/003-supply-adapter-ports/
├── spec.md              # /speckit-specify output
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── supply-ports.md  # Port family contract (types + behavioral contract)
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # /speckit-tasks output (not created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/supply-adapter/
├── package.json                      # UNCHANGED (no new deps)
├── src/
│   ├── index.ts                      # public surface — port types, sandbox adapters, fixtures
│   ├── ports/
│   │   ├── common.ts                 # NEW: MerchantOfRecord, SupplyContent, outcome unions,
│   │   │                             #      OfferBase/QuoteBase/SupplyBooking, SupplyPort<C,O,Q>
│   │   ├── hotel.ts                  # UPGRADED in place (content split, MoR, typed outcomes)
│   │   ├── activity.ts               # NEW
│   │   ├── transfer.ts               # NEW
│   │   └── car-rental.ts             # NEW (supply boundary only — no schema linkage, D-006)
│   ├── sandbox/
│   │   ├── engine.ts                 # NEW (internal): shared deterministic lifecycle engine
│   │   ├── hotel.ts                  # UPGRADED in place onto the engine
│   │   ├── activity.ts               # NEW
│   │   ├── transfer.ts               # NEW
│   │   └── car-rental.ts             # NEW
│   └── __tests__/
│       ├── contract-suite.ts         # NEW: reusable describeSupplyPortContract(...) (not a .test.ts)
│       ├── hotel.contract.test.ts    # NEW
│       ├── activity.contract.test.ts # NEW
│       ├── transfer.contract.test.ts # NEW
│       ├── car-rental.contract.test.ts # NEW
│       └── partial-failure.test.ts   # NEW: two-port cart simulation (INV-007 port guarantees)
packages/api/src/
├── context.ts                        # Container gains activity/transfer/carRental ports
└── container.ts                      # buildContainer wires the three new sandbox adapters
```

**Structure Decision**: extend the two existing directories seed-0001 created
(`src/ports/`, `src/sandbox/`) exactly as the clean-architecture skill's
required layout prescribes; tests colocate in `src/__tests__/` where the root
Vitest config discovers them. No new packages, no new top-level directories.

## Complexity Tracking

No Constitution Check violations — table intentionally empty.

Two consciously-accepted design notes (not violations):

| Note | Why acceptable |
|------|----------------|
| Sandbox adapters hold per-instance in-memory supplier state (quotes/bookings) | The sandbox *simulates the supplier's* memory. Tests and the single-process compose stack are its consumers (INV-019). It is documented as per-process; INV-028 serverless implications belong to the feature that first exposes booking over tRPC in production (seed-0005), which may back it with Postgres or pin a single instance. |
| Booking is idempotent per quote (first outcome recorded and returned) instead of failing on re-book | Retry-safe for cart orchestration (a timed-out book retried must not double-book — spec edge case) and matches aggregator idempotency-key practice. |
