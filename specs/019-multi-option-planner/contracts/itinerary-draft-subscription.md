# Contract: workspace.itinerary.draft — compare-options amendment

**Feature**: specs/019-multi-option-planner | **Amends**: specs/016-stream-draft-response
contracts (terminal result shape only — procedure kind, input, and
authorization are unchanged)

## Procedure

`workspace.itinerary.draft` stays a `subscription`, same `agentProcedure`
authorization gate (INV-023/INV-024), same input schema (`tripRequestSchema`,
unchanged). **What changes**: the terminal `"result"` event's `outcome` no
longer persists anything and now carries 1-3 comparable options instead of one
persisted itinerary.

## Output stream (changed terminal shape)

1. Zero or more (unchanged):
   ```
   { type: "progress", step: "searchingHotels" | "searchingActivities" | "quotingTransfer" | "quotingCarRental" | "assembling" }
   ```
2. Exactly one, terminal:
   ```
   { type: "result", outcome: CompareOutcome }
   ```
   where:
   ```ts
   type CompareOutcome =
     | { status: "drafted"; options: DraftOption[] }   // 1-3 entries, NOT persisted
     | { status: "infeasible"; reason: "budget_below_reserve" | "no_days" }
     | { status: "planner_failed"; reason: "malformed_output" | "no_proposals" };
   ```
   `DraftOption` per data-model.md: `{ variant, label, itinerary: Itinerary, fit }`.
   Every `itinerary` field is a fully assembled, live-priced, valid canonical
   `Itinerary` — the ONLY difference from today's persisted document is that
   **no DB row and no `trip_created` PMF event exist for it yet**.

## Invariants preserved / changed

- **Authorization**: unchanged — agent-only, tenant-scoped.
- **Persistence (INV-021)**: **NO LONGER happens on this procedure.** Zero DB
  writes, zero PMF events, regardless of how many options are returned or
  whether the client disconnects mid-stream. Persistence moves entirely to
  `workspace.itinerary.selectDraft` (new contract, see
  `select-draft-subscription.md`).
- **Verification (FR-003 "verification defines truth")**: options are
  verified against the supply catalog at compare time, but that verification
  is NOT the final word — `selectDraft` re-verifies at selection time (FR-008)
  because time has passed and inventory may have changed.
- **Determinism (FR-009)**: in the keyless/FakeLLM deployment, the same
  `TripRequest` always yields the same `options` array (same variants, same
  labels, same prices, same order).
