# Contract: workspace.itinerary.chatEdit — new subscription

**Feature**: specs/020-chat-itinerary-editing

## Procedure

`workspace.itinerary.chatEdit` — a NEW `subscription` (per INV-028: it drives
an LLM tool loop, so it must stream, not block). `agentProcedure`-gated
(agent-only, tenant-scoped via `ctx.session.agencyId`, identical gating to
`draft`/`selectDraft`/`attachMedia`).

## Input

```ts
{
  itineraryId: string;  // uuid — must already exist and be owned by the caller's agency
  message: string;      // the agent's raw chat text, min length 1
}
```

The client sends only the itinerary id and the new message — never itinerary
content, pricing, or the trip request (the server already has both, via the
existing `document`/`trip_request` columns). No client-echoed data is ever
trusted for persistence (FR-012).

## Output stream

1. Zero or more:
   ```
   { type: "progress", step: "interpreting" | "searchingOptions" }
   ```
2. Exactly one, terminal:
   ```
   { type: "result", outcome: ChatEditOutcome }
   ```
   where (data-model.md):
   ```ts
   type ChatEditOutcome =
     | { status: "applied"; itinerary: Itinerary; fit: AssembleResult["fit"]; reply: string }
     | { status: "suggested"; suggestions: HotelSuggestion[]; reply: string }
     | { status: "no_change"; reply: string }
     | { status: "not_found" }
     | { status: "failed"; reason: "malformed_output" };
   ```

## Behavior

1. Load the itinerary via the EXISTING `loadOwnedItinerary(db, session,
   itineraryId)` helper (`packages/api/src/services/itineraries.ts`) —
   cross-tenant or unknown ids collapse to `{status: "not_found"}`, no
   existence oracle (INV-004, matching `attachMedia`/`detachMedia` exactly).
2. Build the itinerary summary (id/kind/title/dayNumber per item — never the
   full priced document) and call `container.llm.chatEditItinerary(...)`,
   forwarding `progress` events as they arrive.
3. On the terminal `ChatEditResult`:
   - `edit !== null` (direct add/remove): apply it via the SAME
     `applyItineraryEdit` domain function `applyChatEdit` uses, persist via
     the EXISTING `persistDocument` helper, yield `{status: "applied",
     itinerary, fit, reply}`. If application itself fails (e.g. the model
     named an item id that no longer exists because a concurrent edit removed
     it first), fall back to `{status: "no_change", reply: "<explanation>"}`
     — never a partial write.
   - `suggestions.length > 0` (hotel request): yield `{status: "suggested",
     suggestions, reply}` — **zero DB writes**, exactly like `draft`'s
     compare-only step (spec 019 D1 precedent).
   - both empty (clarify/unsupported): yield `{status: "no_change", reply}` —
     zero DB writes.
   - `status: "failed"`: forward `{status: "failed", reason}` unchanged.

## Invariants preserved / new

- **Authorization/tenant scoping (INV-004/INV-023/INV-024)**: identical
  pattern to every other agent-gated, tenant-scoped procedure in this router.
- **Persistence**: a DB write happens ONLY for the `"applied"` outcome, and
  only ever mutates the SAME itinerary row identified by `itineraryId` — never
  a new row, never another agency's row.
- **Money (INV-009/010)**: every price in an applied edit or a suggestion
  comes from a fresh supply-adapter search, never from the model's generated
  text and never from client input.
- **Streaming (INV-028)**: subscription, matching `draft`/`selectDraft`.
- **Determinism (FR-011)**: in the keyless/FakeLLM deployment, the same
  `{itineraryId, message}` against the same itinerary state always yields the
  same outcome.
