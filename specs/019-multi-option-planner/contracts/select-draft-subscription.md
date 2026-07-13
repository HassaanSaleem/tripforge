# Contract: workspace.itinerary.selectDraft — new subscription

**Feature**: specs/019-multi-option-planner

## Procedure

`workspace.itinerary.selectDraft` — a NEW `subscription` (per INV-028: it
drives the same LLM tool loop as `draft`, so it must stream, not block).
`agentProcedure`-gated (agent-only, tenant-scoped via `ctx.session.agencyId`,
identical to `draft`).

## Input

```ts
{
  tripRequest: TripRequest;  // byte-identical schema to draft's input (tripRequestSchema)
  variant: "budgetSavvy" | "balanced" | "premium";
}
```

The client sends back the ORIGINAL trip request it already submitted to
`draft`, plus which variant it picked. **The client never sends itinerary
content or pricing** — FR-012: nothing the client displayed is trusted for
persistence; the server re-derives everything from scratch.

## Output stream

1. Zero or more (identical shape/semantics to `draft`):
   ```
   { type: "progress", step: "searchingHotels" | "searchingActivities" | "quotingTransfer" | "quotingCarRental" | "assembling" }
   ```
2. Exactly one, terminal:
   ```
   { type: "result", outcome: SelectOutcome }
   ```
   where `SelectOutcome` is **byte-for-byte the pre-existing single-draft
   `DraftOutcome` shape** (spec 016), unchanged so the existing
   `DraftResult`/`BookingFlow`/`ShareControl` components need zero changes:
   ```ts
   type SelectOutcome =
     | { status: "drafted"; itinerary: Itinerary; fit: AssembleResult["fit"] }
     | { status: "infeasible"; reason: "budget_below_reserve" | "no_days" }
     | { status: "planner_failed"; reason: "malformed_output" | "no_proposals" };
   ```

## Behavior

Internally re-runs the exact same pipeline `draft` uses (LLM tool loop over
the SAME `tripRequest` → fresh supply verification → pure assembly), then:

- If the requested `variant` is present among the freshly-regenerated options:
  stamp provenance, persist the itinerary + `trip_created` PMF event in ONE
  transaction (INV-021, identical to today's single-draft persistence), yield
  `{ status: "drafted", itinerary, fit }`.
- If regeneration is infeasible or the planner fails (inventory changed,
  budget no longer fits, etc.): yield the SAME typed `infeasible`/
  `planner_failed` outcome `draft` already reports — no partial/silent write
  (FR-008, edge case: inventory changed between compare and select).
- If the requested `variant` key doesn't appear in the freshly-regenerated set
  (e.g. the trip's constraints only supported 1-2 distinct variants this
  time, degenerately dropping the one requested): treat as
  `{ status: "planner_failed", reason: "no_proposals" }` — never silently
  substitute a different variant than the one the agent picked.

## Invariants preserved

- **Persistence (INV-021)**: exactly one DB row + exactly one `trip_created`
  PMF event, only on success — identical guarantee to today's single-draft
  flow, just reached via this procedure instead of `draft`.
- **Money (INV-009/010)**: every price in the persisted document comes from
  the server's own fresh supply re-verification, never from client input.
- **Streaming (INV-028)**: this procedure drives the LLM tool loop, so it is a
  subscription, not a mutation — matching `draft`.
- **Determinism (FR-009)**: in the keyless/FakeLLM deployment, re-running
  `selectDraft` with the same `tripRequest`/`variant` always persists the
  same itinerary content.
