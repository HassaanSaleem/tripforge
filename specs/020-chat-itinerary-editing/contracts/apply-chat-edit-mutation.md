# Contract: workspace.itinerary.applyChatEdit — new mutation

**Feature**: specs/020-chat-itinerary-editing

## Procedure

`workspace.itinerary.applyChatEdit` — a NEW `mutation` (no LLM call, so no
streaming requirement — INV-028 only applies to LLM tool-loop handlers).
`agentProcedure`-gated, identical tenant scoping to `chatEdit`.

## Input

```ts
{
  itineraryId: string;                    // uuid
  edit: { type: "addItem"; dayNumber: number; port: "hotel" | "activity" | "transfer"; offerId: string; startsAt?: string }
      | { type: "removeItem"; itemId: string };
}
```

The ONLY caller in this feature is the chat panel's "Add to trip" button on a
hotel suggestion card, echoing back the exact `offerId` the server itself
returned moments earlier in the same `chatEdit` result (`HotelSuggestion.
offerId`) — never client-invented. The offer is re-verified against a fresh
supply search server-side before being applied (FR-006/FR-012); the client's
copy of the suggestion's price is display-only.

## Output

```ts
type ApplyChatEditOutcome =
  | { status: "applied"; itinerary: Itinerary; fit: AssembleResult["fit"] }
  | { status: "not_found" }
  | { status: "item_not_found" }
  | { status: "invalid_edit" };
```

## Behavior

1. Load the itinerary via `loadOwnedItinerary` — cross-tenant/unknown id →
   `{status: "not_found"}` (identical gating to `chatEdit`/`attachMedia`).
2. Call the SAME `applyItineraryEdit` domain function `chatEdit` uses
   internally (`packages/domain/src/edit.ts`), sourcing a fresh
   `VerifiedOffer` list from the same supply-adapter search
   `verifiedSupplyCatalog`-style helper uses, keyed off the itinerary's own
   persisted `trip_request`.
3. Map the domain `outcome` to the wire shape: `"applied"` → persist via
   `persistDocument`, return `{status: "applied", itinerary, fit}`;
   `"item_not_found"` → `{status: "item_not_found"}`, no write;
   `"unknown_offer" | "no_rate" | "invalid_day" | "empty_result" | "over_budget"` →
   `{status: "invalid_edit"}`, no write.

## Invariants preserved

- **Tenant scoping (INV-004)**: identical to `chatEdit`.
- **Money (INV-009/010)**: the offer is re-verified server-side, never
  trusted from the client's suggestion-card copy.
- **No new streaming surface**: a plain mutation is correct here — this
  procedure makes zero LLM calls (research D5), so INV-028 does not apply.
- **Idempotent-adjacent**: re-submitting the identical `{itineraryId, edit}}`
  after it already applied once re-runs the same deterministic domain
  function against the (now-changed) itinerary state — e.g. a second
  `removeItem` for an already-removed id correctly returns `item_not_found`,
  not a silent no-op success, so the caller always knows what happened.
