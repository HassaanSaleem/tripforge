# Quickstart: Conversational AI Itinerary Editing

## Prerequisites

- Built compose stack (keyless: `ANTHROPIC_API_KEY=""` — deterministic
  FakeLLM path, no network required): `docker compose up --build --wait`
- A signed-in agent account with an agency membership, with at least one
  drafted-and-selected trip already saved (submit the planner form and pick
  an option first if none exists).

## Validation scenario 1 — add and remove via chat (US1)

1. Sign in, open the workspace planner, open (or freshly draft+select) a
   saved trip spanning 2+ days.
2. In the chat panel beside the itinerary, type: "add an activity on day 2".
3. **Expected**: the assistant replies confirming what it added; a new
   activity item appears on day 2; the budget summary updates.
4. Note the title of an existing item (e.g. an activity from day 1). Type:
   "remove the [that item's title]".
5. **Expected**: the assistant confirms the removal; that item disappears
   from its day; the budget summary updates again.
6. Reload the page.
7. **Expected**: both changes are still present (persisted).

## Validation scenario 2 — hotel suggestions and explicit add (US2)

1. On the same trip, type: "suggest a hotel" (or "swap the hotel for
   something boutique").
2. **Expected**: 2-3 hotel suggestion cards render inline in the chat, each
   with a name and price; the itinerary's current stay is UNCHANGED so far.
3. Click "Add to trip" on one of the cards.
4. **Expected**: the itinerary's stay item is replaced by the chosen hotel;
   the budget summary updates; reloading the page shows the new hotel persisted.

## Validation scenario 3 — unsupported request (edge case)

1. Type an off-topic or unsupported message, e.g. "make day 3 cheaper".
2. **Expected**: the assistant replies explaining what it can help with (add,
   remove, or suggest hotels); the itinerary is byte-identical to before the
   message (no item added/removed/changed).

## Validation scenario 4 — determinism (US4)

1. With the compose stack still running keyless (no `ANTHROPIC_API_KEY`),
   note the exact current itinerary state, then submit the SAME chat message
   from scenario 1 step 2 against a second, freshly-seeded, identical trip.
2. **Expected**: the resulting itinerary state (which item got added/removed,
   its title, its day) is identical between the two runs.

## Automated coverage pointers

- `packages/domain/src/__tests__/edit.test.ts` — `applyItineraryEdit`: add
  conserves the allocation total (mirrors `assembleItinerary`'s conservation
  guard), remove reduces spend for the correct category, unknown item id →
  `item_not_found`, a hotel add when a stay already exists replaces it
  (research D6), removing the only item on the only day with content →
  `empty_result` (declined, itinerary unchanged).
- `packages/llm/src/__tests__/chat-edit.test.ts` — `FakeLLM.chatEditItinerary`:
  each of the ticket's example phrasings ("add a food tour on day 2", "remove
  the museum", "swap the hotel for something boutique near the water")
  resolves to the expected edit/suggestions shape deterministically across
  repeated calls; an unsupported message yields `edit: null, suggestions: []`.
- `packages/api/src/__tests__/l3-chat-edit.test.ts` — L3: cross-tenant
  `itineraryId` → `not_found` (no oracle, mirrors `attachMedia`/`detachMedia`'s
  existing L3 assertions); `chatEdit`'s `"applied"` outcome persists exactly
  one row update (no new row); `applyChatEdit` re-verifies the offer
  server-side rather than trusting the client's suggestion-card copy.
- Playwright (`apps/web` L4/UAT journey) — drives scenarios 1 and 2 end-to-end
  in a real browser (this is the ticket's own acceptance scenario).
