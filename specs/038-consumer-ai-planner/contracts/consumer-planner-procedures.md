# Contract: Consumer planner procedures (`clientView.*`)

All three are `protectedProcedure` (any authenticated user; **anonymous → UNAUTHORIZED**).
They REUSE the agent engine services but NEVER invoke a workspace/agent procedure (INV-024).

## §1 `clientView.planInterpret` — mutation

**Input** (reuses the agent chat input schema):
```
{ message: string(min 1), priorMessages?: string[](each min 1, max 20) }
```
**Behavior**: calls `interpretChatTripRequest(container, input)` (session-free). Multi-turn
accumulation via transcript join (spec 035) is inherited.

**Output** (`InterpretChatOutcome`, unchanged):
- `{ status: "resolved", tripRequest }` — has ≥ destination + budget.
- `{ status: "needsInfo", reply }` — ask for the missing piece(s); do NOT draft.
- `{ status: "failed", reason: "malformed_output" }`.

## §2 `clientView.planDraft` — subscription

**Input**: `tripRequestSchema` (the resolved `TripRequest`).

**Behavior**: `draftConsumerOptions(container, input)` — runs `draftOptions(container,
ephemeralAgencyId=randomUUID(), input)`; streams progress; on completion maps each
`DraftOption` → redacted `ConsumerDraftOption` (via `toClientItineraryView`). **Never
persists**; writes no DB row.

**Streamed events**:
- `{ type: "progress", step }` — forwarded planner steps.
- `{ type: "result", outcome }` where outcome is:
  - `{ status: "drafted", options: ConsumerDraftOption[] }` (1–3), OR
  - `{ status: "infeasible", reason: "budget_below_reserve" | "no_days" }`, OR
  - `{ status: "planner_failed", reason: "malformed_output" | "no_proposals" }`.

**Redaction invariant**: no `netRate`, `supplyRef`, supplier id, markup bps, or MoR field
appears in any streamed payload (asserted in tests).

## §3 `clientView.requestPlan` — mutation

**Input**:
```
{
  tripRequest: tripRequestSchema,                 // authoritative criteria + budget
  variant: "budgetSavvy" | "balanced" | "premium",
  optionTitle: string(min 1, max 200),            // display label
  contactName: string(min 1, max 200),
  contactEmail?: email,
  notes?: string(max 2000)
}
```
**Behavior**: `submitConsumerPlanRequest(container, session, input)` — inserts one
`consumer_plan_request` row (`traveler_user_id = session.userId`, `status = "new"`); moves no
money, touches no booking/itinerary table.

**Output**:
- `{ status: "submitted", requestId }` on success.
- Validation failure (missing `contactName`) → the zod parse rejects at the input boundary; no
  row created. (A blank/whitespace name fails `min 1`.)

**Auth**: anonymous → UNAUTHORIZED (protectedProcedure). No agency context read or required.

## Agent-side (updated, behavior-preserving)

`workspace.itinerary.draft` / `.interpretChatRequest` call the refactored services with the
new signatures (`draftOptions(container, ctx.session.agencyId, input)`,
`interpretChatTripRequest(container, input)`). No observable agent-behavior change.
