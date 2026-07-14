# Research: Conversational AI Itinerary Editing

## D1: How does the LLM target an existing item for removal/replacement?

**Decision**: Items already carry a stable `id` (`packages/itinerary-schema/src/item.ts`, e.g.
`"d2-i1"`, assigned once at assembly time and never renumbered afterward).
The chat-edit interpretation call is given the current itinerary rendered as a
compact `{id, kind, title, dayNumber}` list (never the full priced document —
no reason to spend tokens on pricing/media/supplyRef the model doesn't need),
and resolves a removal/replacement request to one of those existing `id`s.
Domain-side application then finds the item by `id` across `itinerary.days`.

**Rationale**: No itinerary-schema change, no migration note needed (Principle
IV) — the id already exists and is already unique per document (assembly
assigns `d{dayNumber}-i{itemIndexInDay+1}`, never reused after a removal since
ids are not renumbered).

**Alternatives considered**: Positional `(dayIndex, itemIndex)` addressing —
rejected: fragile after a prior edit shifts array indices within the same
conversation, whereas an id survives sibling removals.

## D2: How does an "add" or "hotel suggestion" request source real, live-priced options?

**Decision**: Reuse `packages/api/src/services/planner.ts`'s existing
`canonicalCriteria()`/`verifiedSupplyCatalog()`-style pattern: the chat-edit
service function re-derives the SAME search criteria (destination, dates,
party) from the itinerary's own persisted `trip_request` column (already
stored alongside `document` — no new column) and calls the SAME
`PlannerToolDeps` search functions (`searchHotelRates`/`searchActivities`/
`quoteTransfer`) the planner's tool loop already uses. The LLM only ever
chooses among these freshly-returned, already-verified offers — never invents
an offerId (mirrors the existing "propose, then re-verify" architecture; here
verification and proposal collapse into one step since the LLM's tool call
result IS already the reused search).

**Rationale**: Zero new supply-adapter surface (Principle V); the exact same
tenant-agnostic, supplier-agnostic vocabulary (`HotelOffer`/`ActivityOffer`/
`TransferOffer`) already crosses the LLMPort boundary today via
`PlannerToolDeps`.

**Alternatives considered**: A separate "curated catalog" lookup for hotel
suggestions — rejected/deferred: the curated catalog (demo-01-seed) is not yet
landed on `main`; hotel suggestions read through the same generic sandbox
supply adapter every other planner surface uses today, and will pick up
richer data automatically once demo-01-seed lands (spec Assumptions).

## D3: Direct edits vs. suggestion-and-pick — why does only the hotel case get a card UI?

**Decision**: Activity/transfer add and item removal are applied directly and
immediately by the interpretation step (one LLM call resolves straight to an
`Edit`); a hotel add/swap/suggestion request instead yields 2-3
`HotelSuggestion` values and NO edit — the itinerary is only mutated when the
agent clicks "Add to trip" on a specific card, via a second, LLM-free
mutation.

**Rationale**: Spec US2 (P1) explicitly calls out hotel choice as the
one case needing a visible pick-one moment — it is the trip's highest-value,
most personal line item, and the operator's ask names "inline hotel
suggestions" as a distinct UI moment, not a silent swap. Activities/transfers
are comparatively low-stakes and the ticket's acceptance scenario exercises
them as direct chat actions ("add a food tour on day 2" → it just happens).

**Alternatives considered**: Suggestion cards for every add (activities too) —
rejected: not in the ticket's acceptance scenario, adds a UI/interaction
surface with no requirement behind it (YAGNI, constitution's Simplicity
Default), and would double every activity-add round trip through the
suggestion-then-click pattern for no requested benefit.

## D4: How does an applied edit stay within INV-028 (any LLM tool-loop handler must stream)?

**Decision**: `LLMPort` gains `chatEditItinerary(req): AsyncGenerator<ChatEditProgressEvent>` —
byte-for-byte the same progress-then-one-terminal-result shape as
`draftItinerary` (`{type:"progress", step}` events, then one
`{type:"result", result}`). The router's `chatEdit` procedure is a
`subscription`, exactly like `draft`/`selectDraft`. The service function that
backs it calls `chatEditItinerary`, and if the terminal result carries a
concrete `edit` (not suggestions, not a clarify), immediately applies it via
the SAME domain function the direct-apply mutation uses (`applyItineraryEdit`)
inside the SAME generator, then yields a final `{status:"applied", ...}`
result — one round trip end-to-end per direct edit, matching the "the
itinerary and budget update correctly" acceptance criterion (no separate
confirm step for adds/removes).

**Rationale**: Reuses the existing streaming architecture wholesale rather
than inventing a second one; a request handler that runs a tool loop (search
hotels/activities/transfers) MUST stream per INV-028 regardless of how simple
the resulting mutation is.

**Alternatives considered**: A blocking mutation for `chatEdit` since most
individual edits are fast — rejected: INV-028 is about the LLM tool loop's
worst-case latency (multiple tool round trips against a live provider in
production), not the common-case fast path; a blocking procedure would work
today against FakeLLM/sandbox and silently break INV-028 the day a slower live
search is behind it.

## D5: How does "Add to trip" on a suggestion card apply without a second LLM call?

**Decision**: A SEPARATE, plain `mutation` — `applyChatEdit(itineraryId, edit)`
— takes an already-fully-specified `Edit` value (constructed client-side from
the exact suggestion the agent clicked: `{type:"addItem", dayNumber, port:
"hotel", offerId}`) and calls the SAME `applyItineraryEdit` domain function
the streamed `chatEdit` path uses internally, with no LLM involvement. The
frontend never invents this value from scratch — it echoes back only an
`offerId` that came from a suggestion the server itself returned moments
earlier in the same session, re-verified again server-side via the same
supply search before being applied (never trusted as final pricing — FR-006/
FR-012).

**Rationale**: Avoids a wasteful, latency-adding second LLM round trip for a
button click where the agent has already made the decision; keeps the actual
mutation logic in exactly one place (`applyItineraryEdit`), used by both entry
points — direct chat edits and suggestion-card clicks.

**Alternatives considered**: Route the "Add to trip" click back through
`chatEdit` with a synthetic message like "add the boutique option" — rejected:
fragile (depends on the LLM re-deriving the same interpretation from generated
text) and pays LLM latency/metering cost for a decision already made by the
user's explicit click.

## D6: Single-stay-per-trip semantics for hotel replacement

**Decision**: `applyItineraryEdit`'s `addItem` case, when `port === "hotel"`,
checks whether any `kind: "stay"` item already exists anywhere in the
itinerary; if one does, the add is treated as a replacement of that stay
(remove the old stay item, insert the new one on the same day) rather than a
second, additional stay.

**Rationale**: v0 itineraries are single-hotel trips throughout the existing
assembly logic (`assembleItinerary` never proposes more than the planner's own
single hotel pick per draft); keeping "adding a hotel" and "replacing the
hotel" as one code path avoids introducing multi-hotel semantics the rest of
the schema/UI (day subtotal display, budget category math) was never designed
to support (spec Assumptions; constitution Simplicity Default/YAGNI).

**Alternatives considered**: A distinct `replaceItem` edit type requiring the
client to always pass the old item's id — rejected as unnecessary
client-side bookkeeping; the server already has full visibility into the
current document and can derive "is this a replace or a first add" itself
without asking the caller to know.

## D7: FakeLLM determinism for chat interpretation

**Decision**: `FakeLLM.chatEditItinerary` is a deterministic, keyword-rule
function over the lowercased message text (remove/delete → item-id lookup by
title-substring match against the current itinerary; swap/replace/suggest +
hotel/stay → hotel search + suggestions; add + anything else → activity search
+ cheapest-not-already-present pick, or transfer search when the message
mentions transfer/transport/taxi/car) — zero `Math.random()`, zero wall-clock
read, matching the file's existing documented guarantee
("ZERO wall-clock dependency" in `fake.ts`'s header comment). Unmatched intent
falls through to a fixed clarifying reply listing the three supported actions.

**Rationale**: Same guarantee `FakeLLM.draftItinerary` already provides
(FR-011/SC-004) — the keyless demo must be exactly reproducible.

**Alternatives considered**: A tiny embedded intent classifier/NLP library —
rejected: unnecessary dependency for a fake whose only job is deterministic,
demoable behavior, not accuracy; keyword rules are sufficient for the ticket's
own example phrasings and easy to reason about/test exhaustively.
