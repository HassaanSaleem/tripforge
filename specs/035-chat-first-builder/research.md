# Research: Chat-First, Multi-Turn Build-to-Book (Agent Surface)

All Technical Context items were resolved from the existing codebase (spec 028/019/009/023) — no external unknowns. Decisions below record the design choices.

## D1 — Where multi-turn accumulation lives: above the LLM boundary (transcript join)

**Decision**: The client keeps the ordered transcript of the agent's own chat turns and sends it to `interpretChatRequest` as `{ message: <latest>, priorMessages: <earlier turns, oldest first> }`. The `interpretChatTripRequest` service joins `[...priorMessages, message].join("\n")` into a single conversation text and passes it to the UNCHANGED `LLMPort.interpretTripRequest({ message: <joined> })`.

**Rationale**:
- `packages/llm` stays 100% unchanged — no port surface change, no adapter/test churn.
- FakeLLM's `interpretTripRequest` already regex-scans the ENTIRE `message` text (`extractDestination`/`extractBudget`/`extractNights`/`extractAdults`/`extractTripStyle`), so a joined transcript accumulates across turns *for free* and deterministically (no `Math.random`, no wall-clock — dates are still resolved one layer up in `packages/api`, per spec 028 D3). SC-004 (keyless determinism) is preserved by construction: the result is a pure function of the transcript string.
- The real AnthropicLLM path passes the joined conversation as the single user message; the existing system prompt already instructs it to interpret the trip request, and a multi-line conversation is a normal input.
- Mirrors spec 028's own layering discipline ("`now` is resolved here, one layer above the LLM").

**Alternatives considered**:
- *Extend `LLMPort.interpretTripRequest` with a structured message history*: rejected — changes the port surface + both adapters + all interpret unit tests for zero product-visible gain; complicates the keyless determinism contract.
- *Client-side accumulation into one big message field*: rejected — leaves the server unable to reason about turn boundaries and pushes join semantics into the browser; keeping the join server-side keeps the wire structured (`priorMessages: string[]`) and the interpretation authoritative on the server.

## D2 — Backward-compatible input shape: optional `priorMessages`

**Decision**: `interpretChatRequestInputSchema` becomes `z.strictObject({ message: z.string().min(1), priorMessages: z.array(z.string().min(1)).max(20).optional() })`. Absent `priorMessages` (or `[]`) is byte-identical to today's single-shot behaviour.

**Rationale**: Additive and backward-compatible — the existing L3 single-message calls and the RBAC test keep passing unchanged. A `.max(20)` cap bounds the transcript (a realistic build converges in a handful of turns) without a product-visible contract.

**Alternatives considered**: replacing `{ message }` with `{ messages: string[] }` — rejected as a needless breaking change to every caller/test for no benefit.

## D3 — "Offer to proceed" confirmation gate before drafting

**Decision**: On a `resolved` interpretation, the chat entry does NOT auto-jump to drafting. It appends an assistant confirmation summarising the resolved trip (destination, nights, party, budget) and shows a **"Build my trip"** CTA. Clicking it calls the existing `onResolved(tripRequest)` → `startDraft`. Any further chat message before building re-interprets the full transcript and replaces the pending resolved request (the CTA always reflects the latest understanding).

**Rationale**: Directly implements FR-002's "explicitly OFFERS to proceed". Makes the hand-off a deliberate step (the agent sees what was understood before spending a draft round trip), and cleanly handles the "keep typing after resolving" edge case by always drafting from the latest resolved request, never a stale one.

**Alternatives considered**: auto-draft on first resolve (spec 028's behaviour) — rejected because the ticket explicitly wants an "offer to proceed", and auto-draft on a multi-turn conversation risks drafting from a half-understood early resolve.

## D4 — Chat primary, form behind a toggle; form-mode on `?destination=`

**Decision**: `planner.tsx` gains `entryMode: "chat" | "form"`, initialised to `initialDestination ? "form" : "chat"`. In the idle view, chat mode renders `<ChatEntry>` primary + a "Prefer a guided form?" toggle; form mode renders the structured form + a "Build by chatting instead" toggle. The form is rendered whenever `entryMode === "form"` (all phases), preserving today's "form survives a failure" behaviour (US2). The chat entry renders in chat mode for the idle (and failed) phases so a post-failure retry stays conversational.

**Rationale**:
- Satisfies FR-005 (chat primary, form an option) and FR-006 (Discover hand-off lands in form mode with the destination pre-filled — the discover-journey e2e asserts exactly this).
- Keeping the form rendered in `entryMode === "form"` across phases is the minimal way to preserve the current always-visible-form behaviour that the planner e2e (US2 failure survival) depends on.

**Alternatives considered**: always render both chat and form (chat merely reordered above) — rejected because "form remains available as an option" implies the form is not shown by default; a toggle is the honest promotion and matches the ticket wording.

## D5 — e2e blast-radius containment

**Decision**: The shared `draftParisTrip(page)` helper (used by ~12 specs) opens the form via the toggle in ONE place; `planner-journey.spec.ts` (its own inline flow) opens the form via the toggle in its two form-driven tests. A NEW `chat-first-journey.spec.ts` covers the multi-turn chat → build → book path without the form.

**Rationale**: Centralises the DOM-shape change to the helper (fixes all helper users at once) plus the two direct planner specs — the exact "fix the helper, run the full suite" discipline. The discover-journey spec needs NO change (it arrives with `?destination=` → form mode → pre-filled form visible).

**Alternatives considered**: keep the form always visible so no e2e changes — rejected because it fails to genuinely promote chat to primary (form would still show by default).

## D6 — Duplicate `currencyFractionDigits` helper stays duplicated

**Decision**: unchanged from spec 028 — the small pure `currencyFractionDigits` in `packages/api` stays independently duplicated (packages/api cannot import from apps/web; extracting a shared package for a 3-line helper is not justified — Constitution Simplicity Default). This feature adds no new duplication.

**Rationale**: Pre-Write reuse scan result recorded in the plan's Pre-Write decisions (PR body): `extend` the existing interpret service/chat-entry/planner; `reuse` startDraft + the compare/select/book pipeline + FakeLLM interpreter; **no `new` cross-package export**.
