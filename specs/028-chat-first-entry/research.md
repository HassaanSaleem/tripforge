# Research: Chat-First AI Itinerary Entry

## D1: Does interpreting a chat message into a trip request require a schema or money-path change?

**Decision**: No. `interpretTripRequest` produces the SAME `TripRequest` shape
`toTripRequest()` already builds from the structured form
(`apps/web/lib/planner-form.ts`) — `{destination, checkIn, checkOut, party,
tripStyle?, budget}` — validated by the existing `tripRequestSchema`
(`packages/api/src/services/planner.ts`). It is fed into the UNCHANGED
`draft`/`selectDraft` pipeline. No new database column, no new canonical
`Itinerary` field, no new money-path code — every price still comes from the
existing live-supply-verification sweep. This resolves the ticket's own
flagged HALT condition: the plan does NOT require an operator gate for
schema/money reasons.

**Rationale**: The ticket explicitly said "No new money/schema surface if it
rides the existing draft + chatEdit procedures — confirm in the plan." This
plan confirms it: chat-first entry is purely an alternative way to PRODUCE a
`TripRequest` value that already existed as a concept; it does not touch
booking, pricing, or the itinerary document at all.

**Alternatives considered**: Persisting the raw chat message or a "chat
session" entity for audit/replay — rejected: not required by any acceptance
scenario (spec Assumptions: a chat trip request is single-shot and not
persisted), and would be exactly the kind of premature schema surface the
ticket warned against.

## D2: Streamed subscription vs. plain mutation for the interpretation step

**Decision**: `interpretTripRequest` is a plain `async` method on `LLMPort`
(not an `AsyncGenerator`), and the router procedure
`workspace.itinerary.interpretChatRequest` is a `mutation`, not a
`subscription`. INV-028 requires streaming for a handler that drives an LLM
TOOL LOOP (multiple round trips against supply search, as `draftItinerary`
and `chatEditItinerary` both do) so the handler stays within serverless
timeouts across an unbounded number of tool calls. Interpreting a chat
message into request parameters never touches a supply port — it is exactly
one LLM call, structurally identical to `LLMPort.complete()` (already a plain
`Promise`, not a generator). Once interpretation resolves, the CLIENT calls
the existing `draft` subscription (already streamed) with the resolved
request — the multi-step, potentially-slow part of the journey is unchanged
and already compliant.

**Rationale**: Matches the existing precedent set by `complete()` (single
call → plain `Promise`) versus `draftItinerary()`/`chatEditItinerary()`
(tool loop → `AsyncGenerator`) in the same file (`packages/llm/src/port.ts`).
Adding an unnecessary subscription would be complexity the constitution's
Simplicity Default (YAGNI) rejects.

**Alternatives considered**: One combined subscription that runs
interpretation THEN immediately chains into `draftOptions`' existing
progress events (the shape floated in the ticket's notes referencing a prior
abandoned attempt, PR #76's design summary) — rejected: it would fork/
duplicate `draftOptions`' subscription logic behind a second entry point
instead of reusing it, exactly what the ticket says not to do ("do NOT fork
them"). Keeping interpretation and drafting as two separate calls (mutation
→ then the client's EXISTING subscribe call) reuses `draftOptions` with zero
duplication and keeps each piece independently testable.

## D3: Resolving "4 days" / no explicit dates into concrete checkIn/checkOut

**Decision**: The LLM boundary (`interpretTripRequest`) never reasons about
"today" — it returns `nights: number` (a duration), not dates. The NEW
service function `interpretChatTripRequest` (`packages/api/src/services/
planner.ts`) converts `nights` into concrete ISO `checkIn`/`checkOut` using
`new Date()` plus a fixed near-term offset (check-in = 21 days from now;
check-out = check-in + `nights`), mirroring how `services/booking/*.ts`
already calls `Date.now()`/`new Date()` directly with no injected clock
(`Container` has no clock port today, and this feature does not add one —
consistent with existing precedent rather than a new abstraction for a
single call site).

**Rationale**: Keeps date/"now" concerns out of the LLM package entirely
(cleaner separation — the LLM's only job is text-to-scalars; the API layer
already owns "what does the server consider now"). A fixed 21-day horizon is
a reasonable "let's plan ahead" default matching the kind of trip the ticket's
own example describes, and is trivially adjustable later without touching the
LLM boundary. Tests assert the RELATIONSHIP (`checkOut - checkIn === nights`
days, `checkIn` is in the future) rather than an exact date string, so the
choice of offset is not a brittle contract.

**Alternatives considered**: Asking the model to compute an absolute date —
rejected: makes `FakeLLM`'s determinism guarantee (FR-008/SC-004) depend on
wall-clock reads inside the interpretation step itself, and requires the
model/fake to know "today," which is exactly the kind of environmental
coupling the existing `draftItinerary`/`chatEditItinerary` fakes deliberately
avoid.

## D4: Defaults for unstated fields — matching the form, not inventing new ones

**Decision**: When a chat message resolves (destination + budget amount both
present), any unstated field takes the SAME default the structured form
starts with (`apps/web/lib/planner-form.ts`'s `INITIAL_VALUES`): `adults: 2,
children: 0, tripStyle: unset (balanced allocator default), budgetMode:
"hardCap", currency: "EUR"` — plus the D3 date-from-nights resolution
(`nights` itself defaults to 4 when not stated).

**Rationale**: Keeps the two entry points behaviorally consistent — an agent
who chats "Lisbon, EUR 2000" gets the same starting assumptions an agent who
opens the form and only fills in destination+budget would land on after
accepting every default. Avoids a second, divergent set of "chat defaults"
the constitution's Simplicity Default would flag as unnecessary.

**Alternatives considered**: Requiring the chat message to specify every
field or fail — rejected: contradicts spec Edge Cases (destination+budget
only "still resolves rather than being rejected") and would make the chat
entry strictly worse than the form for a quick request.

## D5: Client-side reuse — one `startDraft` path for both entry points

**Decision**: `planner.tsx`'s `handleSubmit` (form submit handler) is split
into (a) `toTripRequest(values)` mapping (unchanged, form-only) that produces
a `TripRequest`, and (b) a new `startDraft(tripRequest)` helper containing the
EXISTING `trpc.workspace.itinerary.draft.subscribe(...)` call and all of its
`onData`/`onError`/`onComplete` handling, byte-for-byte unchanged. The new
chat-entry component calls `trpc.workspace.itinerary.interpretChatRequest.mutate(...)`,
and on a `resolved` outcome calls the SAME `startDraft(tripRequest)` the form
calls. Both paths therefore share 100% of the compare/select/booking/refine
downstream behavior; the only difference is how a `TripRequest` gets produced.

**Rationale**: Directly satisfies the ticket's "REUSE... do NOT fork" and
spec FR-005/FR-006 (chat-originated and form-originated drafts behave
identically). A pure refactor of existing, already-tested logic — no new
subscription-handling code path to test twice.

**Alternatives considered**: Duplicating the subscribe call inside the new
chat-entry component — rejected: exactly the fork the ticket and spec FR-006
explicitly warn against; any future change to draft-subscription handling
would need to be made in two places.

## D6: Single-shot interpretation, not an accumulating conversation

**Decision**: Each chat-first message is interpreted independently — there is
no server-side conversation state carried between an initial message and a
follow-up after a clarifying reply (spec Assumptions, User Story 2 Scenario
3). The client keeps a simple local list of displayed messages (agent + any
clarifying assistant replies) for UI continuity only, exactly mirroring how
`ChatPanel`'s own conversation state is React-local and not persisted (spec
020 Assumptions) — this feature does not even need that much: nothing here
is later "resumed," since a resolved interpretation immediately hands off to
the draft subscription and the chat-entry component's job is done.

**Rationale**: Keeps the interpretation call itself completely stateless and
therefore trivially deterministic/testable — the same guarantee `FakeLLM`
already provides for `draftItinerary`/`chatEditItinerary`. Matches the
ticket's own scope framing (a single message maps to a request or a
clarification, not a multi-turn slot-filling dialogue).

**Alternatives considered**: Accumulating partial parameters across turns
(e.g. remembering a destination stated in message 1 when message 2 supplies
the budget) — rejected as out of scope: no acceptance scenario requires it,
it would require new server-side session state (a schema surface the ticket
explicitly wants avoided unless necessary), and a re-typed single message
that includes everything is a fine UX fallback for the demo/MVP.

## D7: FakeLLM determinism for chat-first interpretation

**Decision**: `FakeLLM.interpretTripRequest` is a deterministic, regex/
keyword extractor over the lowercased message text — mirroring
`chatEditItinerary`'s existing keyword-rule style in the same file:
- **Destination**: text following `" in "` or `" to "`, cut at the next
  clause boundary (`,`/` for `/` with `/` on `/end of string`); falls back to
  `needsInfo` if no such pattern is found.
- **Nights**: first regex match of `(\d+)\s*(day|days|night|nights)` —
  `day(s)` count converts to `nights = max(1, days - 1)`; `night(s)` count is
  used directly; defaults to 4 when absent (D4).
- **Party**: `for\s+(\d+)` → `adults`; defaults to 2 (D4); `children` always
  defaults to 0 (no ticket example needs child-count-by-chat, matches D4).
- **Budget**: first regex match of a 3-letter currency code or `$`/`€`/`£`
  adjacent to a number (`(?:eur|usd|gbp|\$|€|£)\s*([\d,]+)` and the reverse
  order) — falls back to `needsInfo` if no amount is found; currency defaults
  to EUR (D4) when an amount is found without a recognizable code/symbol.
- **Trip style**: keyword match — `boutique|luxury|upscale|premium` →
  `premium`; `cheap|backpack|shoestring|budget-friendly|budget-savvy|"on a
  budget"` → `budget`; otherwise unset (balanced default). Deliberately NOT
  bare `"budget"` — that word overwhelmingly names the money amount ("budget
  of $3000"), not a style preference; only more specific phrasing signals the
  budget-savvy STYLE (caught during implementation by a test asserting
  `tripStyle` stays unset for "budget $3000").

Zero `Math.random()`, zero wall-clock read inside the LLM boundary (D3 keeps
"now" out of it) — same guarantee `FakeLLM.chatEditItinerary` already
documents.

**Rationale**: Directly mirrors the file's existing, already-reviewed
pattern for `chatEditItinerary` rather than inventing a new interpretation
style; sufficient to satisfy the ticket's own example phrasing ("Plan 4 days
in Lisbon for 2, ~EUR2000, boutique stay") and every spec acceptance
scenario, which only require destination/budget presence-or-absence to be
detected reliably, not full NLU.

**Alternatives considered**: A tiny embedded intent/NLP library — rejected
for the same reason `chatEditItinerary` rejected it: unnecessary dependency
for a fake whose job is deterministic, demoable behavior, not linguistic
accuracy; the real `AnthropicLLM` path handles genuinely ambiguous phrasing
via the live model.
