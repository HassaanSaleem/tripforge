# Research: Multi-Option AI Itinerary Generation

## D1: Where does "which of N options was picked" round-trip to the server?

**Decision**: The client never echoes back itinerary content or pricing. It
sends back only the original `TripRequest` (already a stable, server-validated
shape reused unchanged from the `draft` procedure) plus the chosen `variant`
key (`"budgetSavvy" | "balanced" | "premium"`). The server re-runs the exact
same deterministic pipeline (LLM tool loop + fresh supply verification +
assembly) used for comparison, filters to the requested variant, and persists
only that one.

**Rationale**: Trusting client-echoed itinerary/pricing data for persistence
would violate INV-009/010 (money is always server-computed) and FR-012. A
server-side cache keyed by a `draftSessionId` was considered (see Alternatives)
but rejected: this is a single-process Node service today, but the "INV-028
serverless blind spot" pattern already burned this codebase once (in-process
singleton state on a request path masked a cross-request bug) — a stateless
re-derive avoids reintroducing that class of bug for a low-traffic comparison
step where doubling one supply-catalog fetch is cheap.

**Alternatives considered**:
- *Server-side draft cache (in-memory Map keyed by a session id)*: avoids a
  second LLM/supply round trip, but introduces per-process state that a
  second Node instance or a restart between compare and select would lose —
  rejected as unnecessary complexity for a demo-scale feature per the
  Simplicity Default (constitution Development Workflow) and the repo's prior
  bad experience with in-process cross-request state.
- *Client sends back the full chosen Itinerary object to a "persist this
  as-is" mutation*: fastest, but trusts client-supplied money/content data —
  directly conflicts with FR-012 and INV-009/010. Rejected outright.

## D2: How does FakeLLM produce deterministic, genuinely distinct variants?

**Decision**: `FakeLLM.draftItinerary` runs the SAME tool lookups it already
runs today (hotels/activities/transfers, one shared fetch), then builds THREE
labeled day-plans from the same offer lists using distinct, deterministic
selection rules:
- `budgetSavvy`: cheapest hotel, fewer activities per day (skip every other
  slot when 2+ are available), cheapest transfer.
- `balanced`: today's existing selection exactly (cheapest hotel, one activity
  per day cycling through ranked list, cheapest transfer) — preserves
  backward-compatible behavior for anything depending on "the" fake draft.
- `premium`: priciest available hotel (falls back to cheapest if only one
  exists), one extra activity per day when the ranked list supports it,
  priciest transfer (falls back to cheapest if only one exists).

Each variant is deduplicated against the others it degenerately equals (edge
case: a 1-offer catalog makes budgetSavvy/premium identical to balanced on
hotel) — the fake returns only the DISTINCT variants that resulted, never two
byte-identical option payloads (FR-010).

**Rationale**: Fully deterministic (no `Math.random`, no wall-clock), reuses
the existing sandbox supply data untouched, and keeps the diff inside
`fake.ts` — no change to the supply adapters or sandbox fixtures.

**Alternatives considered**: Scripting 3 canned `DraftItineraryResult`
sub-drafts via the existing `plannerScripts` constructor option — rejected as
the *default* behavior because it wouldn't be criteria-driven (spec 008's
FR-011 fix pinned criteria to the canonical trip request specifically to avoid
canned/copy-pasted output diverging from the real supply catalog); still
available for tests that want to inject specific scenarios (unchanged
mechanism, orthogonal to this feature).

## D3: Real Anthropic LLM path

**Decision**: `packages/llm/src/anthropic.ts`'s `draftItinerary` prompt is
extended to ask the model to propose 3 named variants (tool-call schema
updated to a `submit_itinerary_drafts` call carrying an array of 1-3 labeled
`PlannerDraft`s instead of exactly-one `submit_itinerary_draft`), each using
the SAME injected tool executors (unchanged `PlannerToolDeps`). Validation
against the (now array-shaped) schema still routes back to the model on
mismatch, unchanged retry semantics.

**Rationale**: Keeps the "propose, then re-verify against fresh supply"
architecture identical — the model still only ever proposes offer references
(INV-001, planner-draft.ts's existing no-pricing/no-provenance vocabulary is
unchanged, just repeated per labeled variant).

**Alternatives considered**: Three separate `complete()`/tool-loop calls (one
per variant) — rejected: 3x the latency and 3x the metered LLM cost
(INV-013) for no accuracy benefit, and breaks the "one shared supply-catalog
read" guarantee that keeps all options mutually comparable (same live prices
at the same instant).

## D4: PMF event semantics

**Decision**: `recordPmfEvent({ type: "trip_created", ... })` continues to
fire exactly once, only from the (new) selection path's persistence
transaction — identical call site/shape to today's single `draftItinerary`,
just relocated from the comparison generator to the selection generator.

**Rationale**: Preserves SC-003/FR-006 exactly — the funnel event already
means "a trip was created," and a trip is only created at selection time now.
No new PMF event type needed.
