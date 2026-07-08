# Phase 0 Research: Supply Adapter Port Family + Sandbox Mocks

No NEEDS CLARIFICATION markers remained in the Technical Context; the decisions
below resolve every design-shaping question. Repo facts were verified by
reading the code (paths cited), not assumed.

## D1 — Typed verb outcomes: status-discriminated unions declared in the ports

**Decision**: `quote`, `book`, and `cancel` return status-discriminated union
outcomes (e.g. `BookingOutcome = Confirmed | Failed{reason}`) with closed,
machine-readable reason sets. Business failures are VALUES; thrown exceptions
are reserved for programmer/infra errors.

**Rationale**: Partial-failure cart orchestration (INV-007) must branch on
failure kind ("quote_expired" → re-quote; "supplier_rejected" → surface to
agent) without parsing text. The existing boundary already uses this pattern
(`HotelBooking.status: "confirmed" | "failed"`, packages/supply-adapter/src/ports/hotel.ts:34)
— this extends it in place with reasons.

**Alternatives considered**:
- `Result<T, E>` from `@tripforge/shared` (packages/shared/src/result.ts):
  rejected — supply-adapter does not currently depend on shared, and adding a
  workspace dependency changes `package.json` + `pnpm-lock.yaml`, which the
  loop runtime cannot regenerate (host pnpm denied — desk row ENV-PNPM-DENY)
  and which would invalidate the frozen-lockfile Docker build. The domain
  vocabulary (`status: "confirmed" | "failed"` with reason enums) is also more
  expressive at callsites than generic `ok/err`.
- Thrown typed errors: rejected — conflates expected business outcomes with
  faults; cart code in try/catch loses which sibling holds survive.

## D2 — One generic port shape, four nominal ports

**Decision**: a generic `SupplyPort<TCriteria, TOffer, TQuote>` interface in
`ports/common.ts` defines the four verbs once; `HotelPort`, `ActivityPort`,
`TransferPort`, `CarRentalPort` are nominal interfaces extending it with their
concrete type parameters.

**Rationale**: four callsites share one verb shape — this is the
clean-architecture skill's "generalize" threshold (2+ callsites sharing a
shape → hoist and name the concept). It is also what makes ONE contract test
suite (FR-008) possible.

**Alternatives considered**: four independent interfaces (rejected: 4×
duplication of verb signatures and outcome plumbing; contract suite would need
per-port adapters anyway); a single non-generic port with a `component` tag
(rejected: erases per-component criteria/offer typing the allocator needs).

## D3 — Stateful sandbox with a shared internal engine + injectable clock

**Decision**: one internal `sandbox/engine.ts` implements the deterministic
quote/book/cancel lifecycle (known-offer registry, hold computation, expiry
check, idempotent booking record, cancel transitions); each of the four
sandbox adapters composes the engine with per-component fixtures and a hold
window. Clock is injectable (`now: () => number`, defaulting to `Date.now`) —
the pattern the existing sandbox already uses
(packages/supply-adapter/src/sandbox/hotel.ts:20).

**Rationale**: expiry enforcement and booking idempotency need memory of
issued quotes/bookings; a shared engine keeps the four adapters at
fixture-size (compactness, no 4× lifecycle duplication). Deterministic = same
call sequence + same clock → same outputs (counter-derived ids, fixture-derived
prices, no network/randomness) per FR-007/INV-019.

**Alternatives considered**: stateless adapters encoding state in ids
(rejected: cannot express idempotent booking, unknown-booking cancels, or
already-cancelled without a registry; id-encoded expiry is spoofable by
callers); per-adapter copy-pasted lifecycle (rejected: quality-bar
duplication).

**Recorded constraint**: sandbox state is per-process — the simulated
*supplier's* memory. Fine for Vitest and the single-process compose stack
(INV-019); the INV-028 serverless question belongs to seed-0005 when booking
first crosses tRPC in production shape.

## D4 — Failure injection: well-known pre-seeded fixture, not a mutable API

**Decision**: every sandbox pre-seeds one well-known offer
(`SANDBOX_FAIL_BOOK_OFFER_ID`, exported constant) that quotes normally but
always books to `failed { reason: "supplier_rejected" }`.

**Rationale**: FR-007 demands deterministic failure simulation for cart tests;
a fixture is deterministic by construction and needs no test-only mutable
methods on the port surface.

**Alternatives considered**: `failNextBook()` toggle (rejected: mutable
test-only API on adapters, order-dependent tests); throwing on a magic
criteria value (rejected: business failure must be a value per D1).

## D5 — Booking is idempotent per quote

**Decision**: the first `book(quoteId)` outcome (confirmed OR failed) is
recorded; every subsequent `book` of the same quote returns the recorded
outcome. A quote is consumed by its booking; it can never produce two bookings.

**Rationale**: spec edge case ("never double-books"); retry-safety for cart
orchestration after timeouts; mirrors aggregator idempotency-key practice.

**Alternatives considered**: failing re-book with a `quote_consumed` reason
(rejected: forces every retrying caller to special-case "failed but actually
succeeded", the classic double-charge bug shape).

## D6 — Expiry semantics: enforced at book time, boundary exclusive

**Decision**: a quote is bookable iff `now < expiresAt`; at or after the
instant of expiry, `book` fails with `quote_expired` and creates nothing.
Re-quote = calling `quote(offerId)` again → fresh quoteId + fresh hold.

**Rationale**: INV-006 ("an expired quote re-quotes — it never books silently
at a changed price"); the spec's edge case fixes the boundary as exclusive.
Hold windows differ per component in the sandbox (e.g. hotel 15 min, activity
30 min, transfer 10 min, car 20 min) so no consumer can bake in a global TTL
assumption — the expiry on the quote is the only truth (INV-025 semantic-key
spirit: per-quote expiry, never a blind global TTL).

## D7 — Merchant-of-record: closed declaration set on the quote

**Decision**: `MerchantOfRecord = "platform" | "agency" | "supplier"`, carried
on every quote. Sandbox placeholders: hotel → `agency` (bedbank net-rate model:
agency collects from client, pays net), activity/transfer/car → `supplier`
(commission-model aggregators collect). Real adapters supply the true value
from aggregator terms.

**Rationale**: PRD §9.2 — an explicit MoR decision per component drives
payments/refunds/liability design. P0 ships the declaration only (payments
deferred per ADR-0001 stack table). Extending the set later is an
adapter-package edit, not a schema change.

## D8 — Content/price split WITHOUT media refs at v0

**Decision**: `SupplyContent = { title, description?, features? }` on every
offer, structurally separated from price fields (`netRate`). Media references
are NOT in v0 content: they join `SupplyContent` together with the Postgres
materialization follow-up, because the only legal media-ref type is
`MediaRef` in `packages/itinerary-schema` (INV-001) and importing it would add
a workspace dependency (same lockfile constraint as D1) to serve zero
consumers today.

**Rationale**: FR-010's essence is the separation (cacheable descriptive
content vs never-cached live rates); the follow-up ticket
(the PR files it as a backlog entry) owns materialization + media enrichment
in one coherent slice with its first consumer (content library / builder).

**Alternatives considered**: importing MediaRef now (rejected: lockfile churn
the loop runtime cannot regenerate + speculative field with no consumer);
declaring a local media shape (rejected outright: INV-001 violation).

## D9 — No zod in the port layer

**Decision**: ports stay pure TypeScript contracts (as the existing
`ports/hotel.ts` is); no runtime validation inside the package.

**Rationale**: the clean-arch rule "zod at every boundary" targets untrusted
boundaries. Port calls are in-process, compiler-checked calls from the
application layer; the untrusted boundaries are (a) tRPC inputs — already
zod-validated in `packages/api` — and (b) real supplier HTTP responses, which
get zod-validated INSIDE their future adapters before mapping to port shapes
(that is where "no supplier shape leaks" is enforced at runtime). Adding zod
would also change package.json/lockfile (D1 constraint).

## D10 — Verification levels for this feature

**Decision**:
- L1/L2: the reusable behavioral contract suite run against all four sandbox
  adapters + a two-port partial-failure cart simulation
  (`packages/supply-adapter/src/__tests__/`).
- L3: explicitly deferred with rationale — no HTTP route, DB table, or
  external service consumes the new ports yet, so there is no real-app state
  delta to assert. The L3 state-delta booking tests are exactly seed-0004
  (harness) + seed-0005 (booking flow) scope. Recorded in the PR body.
- Live gate (INV-027): the composition root (boot path of the built image) is
  touched, so the built compose stack is booted, `node
  tests/integration/smoke.mjs` runs against it, and the compose log is
  scanned; no browser journey (no UI-facing change) — carve-out documented in
  the PR body with evidence archived.

## D11 — Multi-currency proof in fixtures

**Decision**: sandbox fixtures span currencies (hotel USD, activity EUR,
transfer USD, car rental EUR); the contract suite asserts every price carries
an explicit currency, and the partial-failure cart test intentionally mixes
currencies with zero conversion anywhere (INV-009: conversion is an explicit,
logged operation elsewhere).
