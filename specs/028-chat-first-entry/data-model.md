# Data Model: Chat-First AI Itinerary Entry

No changes to the canonical itinerary schema (`packages/itinerary-schema`) or
any persisted table shape (research D1 — no migration note needed). This
feature only adds new in-memory/wire vocabulary between `packages/llm`,
`packages/api`, and `apps/web`, and reuses the EXISTING `tripRequestSchema`
(`packages/api/src/services/planner.ts`) as its output shape.

## InterpretedTripParams (new, packages/llm/src/interpret-trip-request.ts)

```ts
const InterpretedTripParamsSchema = z.strictObject({
  destination: z.string().min(1),
  nights: z.number().int().min(1).max(30),
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
  tripStyle: z.enum(["balanced", "budget", "premium"]).nullable(),
  budgetMajor: z.number().positive(),
  currency: z.string().length(3),
});
type InterpretedTripParams = z.infer<typeof InterpretedTripParamsSchema>;
```

A duration (`nights`), never absolute dates (research D3) — "now" is
resolved one layer up, in `packages/api`, not inside the LLM boundary.
`tripStyle: null` means "no preference stated" (maps to the allocator's own
balanced default, exactly like the form's `tripStyle: ""` today).

## InterpretTripRequestResult (new, packages/llm/src/interpret-trip-request.ts)

```ts
type InterpretTripRequestResult =
  | { status: "resolved"; params: InterpretedTripParams; usage: LlmUsage }
  | { status: "needsInfo"; reply: string; usage: LlmUsage }
  | { status: "failed"; reason: "malformed_output" };
```

`resolved` requires (at minimum) a destination and a budget amount to have
been identified in the message — everything else in `InterpretedTripParams`
is already defaulted by the time this status is returned (research D4), so
the caller never has to fill gaps itself. `needsInfo` covers "no destination"
and "no budget" (spec FR-004) — `reply` names exactly what's missing.

## LLMPort addition (packages/llm/src/port.ts)

```ts
interface InterpretTripRequestRequest {
  purpose: string;   // metering (INV-013), e.g. "planner.chatEntry"
  message: string;   // the agent's raw chat text
}

interface LLMPort {
  // ...existing methods unchanged...
  interpretTripRequest(req: InterpretTripRequestRequest): Promise<InterpretTripRequestResult>;
}
```

A plain `Promise`, NOT an `AsyncGenerator` — no tool loop runs during
interpretation (research D2), so this deliberately does not follow
`draftItinerary`/`chatEditItinerary`'s streamed shape; it mirrors
`complete()`'s existing plain-`Promise` shape instead.

## InterpretChatOutcome (new, packages/api/src/services/planner.ts) — router-facing terminal shape

```ts
type InterpretChatOutcome =
  | { status: "resolved"; tripRequest: TripRequest }   // TripRequest = EXISTING, unchanged type
  | { status: "needsInfo"; reply: string }
  | { status: "failed"; reason: "malformed_output" };
```

`tripRequest` is byte-shape-identical to what `toTripRequest()` already
produces from form values — the client feeds it straight into the EXISTING
`workspace.itinerary.draft` subscription, unchanged (research D5).

Date resolution (research D3) happens INSIDE the service function that
produces this outcome: `checkIn = isoDate(new Date(now + 21 days))`,
`checkOut = isoDate(new Date(now + 21 days + params.nights days))`. Party/
style/budget/currency map straight across from `InterpretedTripParams`
(`budgetMajor` → `amountMinor` via the SAME `Math.round(major * 10 **
currencyFractionDigits(currency))` conversion `toTripRequest()` already uses
— reused via a shared helper, not reimplemented, so the two entry points
convert money identically).

## State transitions (chat-entry component, client-side view state)

```
[idle, no draft] --submit message--> [interpreting] --terminal result-->
   +-- resolved --------> startDraft(tripRequest)  (== the EXISTING
   |                       [drafting] -> [comparing] -> ... state machine,
   |                       byte-identical whether reached from chat or form)
   +-- needsInfo --------> [idle, no draft] (reply shown as an assistant
   |                       message in the chat-entry box; agent may retype)
   +-- failed/connection ends -> [idle, no draft] (error reply shown)
```

The chat-entry component's own state disappears once `startDraft` runs — it
is idle-phase-only (spec Assumptions: single-shot, not a persisted
conversation), mirroring how `ChatPanel`'s conversation state is React-local
scratch state, not a durable entity (spec 020 precedent).
