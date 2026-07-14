# Data Model: Conversational AI Itinerary Editing

No changes to the canonical itinerary schema (`packages/itinerary-schema`) or
any persisted table shape (INV-001/Principle IV — no migration note needed).
This feature only adds new in-memory/wire vocabulary between `packages/llm`,
`packages/domain`, `packages/api`, and `apps/web`, and mutates the EXISTING
`itinerary.document` jsonb column via the existing load-mutate-persist pattern
(`loadOwnedItinerary`/`persistDocument`, `packages/api/src/services/
itineraries.ts`, already used by `attachMedia`/`detachMedia`).

## ItineraryEditProposal (new, packages/domain/src/edit.ts)

```ts
type ItineraryEditProposal =
  | { type: "removeItem"; itemId: string }
  | { type: "addItem"; dayNumber: number; port: "hotel" | "activity" | "transfer"; offerId: string; startsAt?: string };
```

`replaceItem` is NOT a separate proposal shape — a hotel `addItem` is treated
as a replacement of the existing stay when one is already present (research
D6); activities/transfers are additive only (no replace requirement in the
spec). `dayNumber` is 1-based, matching `Day.dayNumber` in the canonical
schema.

## ApplyEditOutcome (new, packages/domain/src/edit.ts)

```ts
interface ApplyEditResult {
  itinerary: Itinerary;                 // fully re-derived, re-parsed via ItinerarySchema
  fit: { categories: CategoryFit[]; rebalances: RebalanceMove[] };  // reuses assemble.ts's CategoryFit/RebalanceMove
  outcome: "applied" | "item_not_found" | "unknown_offer" | "no_rate" | "invalid_day" | "empty_result" | "over_budget";
}
```

`CategoryFit`/`RebalanceMove` are imported, not redefined (Pre-Write: reuse —
`packages/domain/src/assemble.ts` already exports both). `"empty_result"`
covers the edge case "would leave the trip with no bookable content" (spec
edge case) — a `removeItem` that would drop the itinerary to zero items across
every day is refused, itinerary unchanged. `"over_budget"` covers a hardCap
trip where no donor category has enough headroom to cover the add (mirrors
`assembleItinerary`'s own `"over_budget"` drop reason) — refused, itinerary
unchanged.

## ChatEditProposal / HotelSuggestion / ChatEditResult (new, packages/llm/src/chat-edit.ts)

```ts
interface HotelSuggestion {
  offerId: string;
  title: string;
  priceMinor: number;
  currency: string;
}

type ChatEditResult =
  | { status: "interpreted"; reply: string; edit: ItineraryEditProposal | null; suggestions: HotelSuggestion[]; usage: LlmUsage }
  | { status: "failed"; reason: "malformed_output" };
```

`edit` is non-null only for a direct add/remove; `suggestions` is non-empty
only for a hotel request (mutually exclusive by construction — a hotel
request never also returns a direct `edit`, per research D3). Both empty
(`edit: null`, `suggestions: []`) represents the clarifying/unsupported reply
case (FR-008).

## ChatEditProgressEvent (new, packages/llm/src/port.ts) — mirrors DraftProgressEvent

```ts
type ChatEditStep = "interpreting" | "searchingOptions";

type ChatEditProgressEvent =
  | { type: "progress"; step: ChatEditStep }
  | { type: "result"; result: ChatEditResult };
```

`LLMPort` gains:

```ts
chatEditItinerary(req: ChatEditRequest): AsyncGenerator<ChatEditProgressEvent>;
```

```ts
interface ChatEditRequest {
  purpose: string;                 // metering (INV-013), e.g. "chat.edit"
  message: string;                 // the agent's raw chat text
  destination: string; checkIn: string; checkOut: string; party: { adults: number; children: number };  // the trip's own canonical criteria (spec 008 FR-011 pinning discipline, reused)
  items: { id: string; kind: "stay" | "activity" | "transfer"; title: string; dayNumber: number }[];      // current contents, never the full priced document
  tools: PlannerToolDeps;          // UNCHANGED interface — reused, not extended
}
```

## ChatEditOutcome (new, packages/api/src/services/itineraries.ts) — router-facing terminal shape

```ts
type ChatEditOutcome =
  | { status: "applied"; itinerary: Itinerary; fit: AssembleResult["fit"]; reply: string }
  | { status: "suggested"; suggestions: HotelSuggestion[]; reply: string }
  | { status: "no_change"; reply: string }
  | { status: "not_found" }              // itinerary not owned by caller's tenant (INV-004, no oracle)
  | { status: "failed"; reason: "malformed_output" };

type ChatEditEvent = { type: "progress"; step: ChatEditStep } | { type: "result"; outcome: ChatEditOutcome };
```

## ApplyChatEditOutcome (new, packages/api/src/services/itineraries.ts) — direct-apply mutation shape

```ts
type ApplyChatEditOutcome =
  | { status: "applied"; itinerary: Itinerary; fit: AssembleResult["fit"] }
  | { status: "not_found" }
  | { status: "item_not_found" }
  | { status: "invalid_edit" };   // unknown_offer | no_rate | invalid_day | empty_result, collapsed for the wire (detail stays server-side logs)
```

Used by both the internal apply-after-interpret step inside `chatEdit` and the
standalone `applyChatEdit` mutation (suggestion-card "Add to trip" clicks) —
one function, two callers (research D5).

## State transitions (chat panel, client-side view state)

```
[idle] --submit message--> [interpreting] --terminal result-->
   +-- edit applied ------------------> [idle] (itinerary + budget re-rendered)
   +-- hotel suggestions returned -----> [suggesting] --click "Add to trip"--> [applying] --applied--> [idle]
   +-- clarify/no_change ---------------> [idle] (reply shown, nothing changed)
   +-- failed/connection ended ---------> [idle] (error reply shown)
```

`[suggesting]` holds no server-side state — suggestions are a value in the
client's chat message list, exactly like any other assistant reply; abandoning
them (asking something else, navigating away) leaves zero trace, matching the
spec's edge case for ignored suggestions.
