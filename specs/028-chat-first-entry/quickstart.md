# Quickstart: Chat-First AI Itinerary Entry

## Prerequisites

- Built compose stack (keyless: `ANTHROPIC_API_KEY=""` — deterministic
  FakeLLM path, no network required): `docker compose up --build --wait`
- A signed-in agent account with an agency membership, on the AI Builder /
  workspace planner page with NO existing draft yet (a fresh session, or
  after navigating away from any previously drafted trip).

## Validation scenario 1 — start a trip by chatting (US1)

1. Sign in, open the workspace planner (AI Builder landing view).
2. In the new chat-entry box (alongside the structured form), type: "Plan 4
   days in Lisbon for 2, EUR 2000, boutique stay".
3. **Expected**: a "thinking"/working indicator shows briefly, then the
   compare view (spec 019) renders 1-3 live-priced Lisbon options, each
   showing a total and a within/over-budget indicator — the SAME view the
   structured form would have produced for equivalent inputs.
4. Click "Choose this option" on one of the cards.
5. **Expected**: the same persist → drafted-result view → booking/share
   controls → post-draft `ChatPanel` appear, exactly as they do today when
   reached via the form (spec 019 US2, spec 020).

## Validation scenario 2 — clarifying reply when required info is missing (US2)

1. On the AI Builder landing view, type a chat message with no destination,
   e.g. "Plan a trip for 2 with a EUR 2000 budget".
2. **Expected**: the assistant replies asking for a destination; the AI
   Builder remains on the landing view — no compare view, no draft attempted.
3. Type a chat message with a destination but no budget, e.g. "Plan 4 days in
   Lisbon for 2".
4. **Expected**: the assistant replies asking for a budget; still on the
   landing view.
5. Type a complete message (destination + budget); **expected**: this fresh
   message resolves normally into the compare view (scenario 1), regardless
   of the earlier incomplete attempts.

## Validation scenario 3 — the structured form still works unchanged (regression guard)

1. On the same landing view, ignore the chat box and fill in the structured
   form (destination/dates/party/budget) as before this feature shipped.
2. Submit the form.
3. **Expected**: byte-identical behavior to before this feature — same
   compare view, same options, same downstream flow.

## Validation scenario 4 — determinism (US3)

1. With the compose stack still running keyless (no `ANTHROPIC_API_KEY`),
   submit the SAME chat message from scenario 1 step 2 a second time (a
   fresh landing view / new attempt).
2. **Expected**: the resolved trip-request parameters (destination, party,
   budget, style) are identical between the two runs; only pure date/time
   deltas (if any) are allowed to differ, never the interpreted content.

## Automated coverage pointers

- `packages/llm/src/__tests__/interpret-trip-request.test.ts` —
  `FakeLLM.interpretTripRequest`: the ticket's own example phrasing resolves
  destination/nights/party/budget/style deterministically across repeated
  calls; a message missing a destination or a budget yields `needsInfo` with
  a reply naming the missing piece; an off-topic message also yields
  `needsInfo`.
- `packages/api/src/__tests__/l3-chat-first-entry.test.ts` — L3:
  `interpretChatRequest` requires agent authentication (matches every other
  `workspace.itinerary.*` gate); a `resolved` output's `tripRequest` passes
  `tripRequestSchema` validation and can be fed straight into `draftOptions`
  to reach a real compare outcome end-to-end.
- Playwright (`apps/web` L4/UAT journey) — drives scenarios 1, 2, and 3
  end-to-end in a real browser (this is the ticket's own acceptance
  scenario, plus the regression guard for the existing form).
