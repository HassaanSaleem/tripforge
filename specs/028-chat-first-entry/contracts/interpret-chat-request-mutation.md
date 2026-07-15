# Contract: workspace.itinerary.interpretChatRequest — new mutation

**Feature**: specs/028-chat-first-entry

## Procedure

`workspace.itinerary.interpretChatRequest` — a NEW `mutation` (NOT a
subscription: no tool loop runs during interpretation, research D2).
`agentProcedure`-gated (agent-only; identical gating to `draft`/
`selectDraft`/`chatEdit`). No `itineraryId` in the input — this procedure
never reads or writes any itinerary; it only maps text to request parameters.

## Input

```ts
{
  message: string;   // min length 1 — the agent's raw chat text
}
```

## Output

```ts
type InterpretChatRequestOutput =
  | { status: "resolved"; tripRequest: TripRequest }   // EXISTING TripRequest shape (tripRequestSchema)
  | { status: "needsInfo"; reply: string }
  | { status: "failed"; reason: "malformed_output" };
```

A single response, no streaming — the client, on `resolved`, immediately
calls the EXISTING `trpc.workspace.itinerary.draft.subscribe(tripRequest,
...)` with the returned `tripRequest`, reusing 100% of the existing
compare-then-choose subscription handling (research D5). This procedure's
own job ends the moment it returns.

## Behavior

1. Call `container.llm.interpretTripRequest({ purpose: "planner.chatEntry",
   message: input.message })`.
2. On `status: "resolved"`: resolve `checkIn`/`checkOut` from `params.nights`
   + `new Date()` (research D3), map `params` → the existing `TripRequest`
   shape (research D4 defaults already applied by the LLM boundary; only the
   date/money-unit conversion happens here), validate through the EXISTING
   `tripRequestSchema.parse(...)` (defense in depth — the same schema the
   form's request already goes through), and return `{status: "resolved",
   tripRequest}`.
3. On `status: "needsInfo"`: return `{status: "needsInfo", reply}` unchanged
   — no draft attempted, nothing persisted (spec FR-004).
4. On `status: "failed"`: return `{status: "failed", reason}` unchanged.

## Invariants preserved / new

- **Authorization (INV-023)**: `agentProcedure`-gated, identical to every
  other `workspace.itinerary.*` procedure — an unauthenticated or
  non-agent caller is rejected before this code runs.
- **Tenant scoping (INV-004)**: N/A at this procedure's own boundary — it
  writes nothing and reads nothing tenant-scoped; tenant scoping is enforced,
  unchanged, by the `draft`/`selectDraft` procedures the resulting
  `tripRequest` subsequently flows into (this procedure produces an input
  value, not a side effect).
- **Money (INV-009/010)**: `budgetMajor` → `amountMinor` conversion reuses the
  SAME helper `toTripRequest()` already uses — one conversion implementation,
  two callers, never two independent roundings of the same value class.
- **No streaming (INV-028 N/A here)**: explicitly not a tool-loop handler —
  documented in plan.md's Technical Context so this is not mistaken for a
  gap in INV-028 coverage.
- **Determinism (FR-008/SC-004)**: in the keyless/FakeLLM deployment, the
  same `message` always yields the same `InterpretChatRequestOutput` (date
  resolution's `new Date()` read is the one deliberate exception — see
  research D3 — but two calls within the same process/day still agree,
  which is what the automated tests assert).
