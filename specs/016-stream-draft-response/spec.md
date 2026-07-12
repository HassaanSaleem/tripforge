# Feature Specification: Stream the AI Itinerary Draft Response

**Feature Branch**: `016-stream-draft-response`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Stream the AI itinerary draft response (INV-028 compliance) — the draft request handler currently blocks synchronously on the LLM tool loop with no progress feedback; must stream so it stays within the serverless function timeout, and give the agent progressive visibility into the drafting process, without changing the persistence contract or the keyless FakeLLM path's deterministic behavior."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent watches drafting progress instead of a static spinner (Priority: P1)

An agent fills in the trip request form and submits it to draft an itinerary. Instead of a single frozen "Designing your trip…" message for the whole multi-step planning process, the agent sees the plan take shape step by step (e.g. "Searching hotels…", "Searching activities…", "Pricing transfers…", "Assembling your itinerary…") until the finished, budget-fit itinerary appears — or a clear failure/refusal message if drafting doesn't succeed.

**Why this priority**: This is the entire visible value of the feature — it directly satisfies the acceptance criteria (streaming response) and is what an agent actually experiences. Everything else (transport mechanics) exists to serve this.

**Independent Test**: Submit a valid trip request with a live LLM configured; observe that the UI updates through multiple distinct progress states before the final drafted itinerary or failure renders, rather than remaining on one static message for the whole duration.

**Acceptance Scenarios**:

1. **Given** an agent has filled in a valid trip request, **When** they submit the draft form and a live LLM performs multiple tool calls (hotel search, activity search, transfer quote, car-rental quote, submission), **Then** the UI shows at least one intermediate progress update reflecting an in-progress lookup before the final result appears.
2. **Given** the draft completes successfully, **When** the final progress event arrives, **Then** the UI shows the exact same drafted itinerary and budget-fit summary it showed before this feature existed (title, days, pricing, budget-fit table) — the final rendered outcome is unchanged, only the path to it is now visible.
3. **Given** the draft fails (e.g. no feasible offers, malformed planner output, infeasible budget), **When** the failure occurs at any point during or after the streamed progress, **Then** the UI shows the same failure message it would have shown before this feature existed, and no partial itinerary is persisted or displayed as final.

---

### User Story 2 - Long drafting requests stay within the platform's request-timeout budget (Priority: P1)

When the live-LLM planner takes several tool-call round trips to research and propose a trip, the server sends data back to the client as progress happens rather than holding the connection open in total silence until everything is done. This keeps the request handler compliant with the serverless platform's function-timeout contract (INV-028) and avoids the class of failure where a slow multi-step draft is killed mid-flight with no user-visible explanation.

**Why this priority**: This is the architectural compliance driver for the whole ticket (INV-028) and a P0/P1 concern equal to the UX story — without it, the feature isn't "done," it's just a UI polish item bolted onto a still-blocking handler.

**Independent Test**: Trigger a live-LLM draft and confirm the request handler emits data to the client incrementally (verifiable via network trace / server logs showing multiple flushed events) rather than a single response only after all tool calls resolve.

**Acceptance Scenarios**:

1. **Given** a live-LLM draft request that takes multiple tool-call round trips, **When** the request is in flight, **Then** the server has already sent at least one unit of data to the client before the final result is ready (the connection is not silent for the full duration).
2. **Given** the keyless (no API key) local/test path, **When** a draft is requested, **Then** the deterministic fake planner's behavior, timing characteristics, and final output are unchanged from before this feature — it may emit the same progress-shaped events, but every existing automated assertion about its final result keeps passing unmodified.

---

### User Story 3 - A drafting request that fails or is interrupted leaves no partial state (Priority: P2)

If the browser tab is closed, the network drops, or the planner fails partway through, no itinerary is left half-created and no misleading "success" is shown. The persistence contract (one canonical document + one PMF event, written together, only on full success) is unaffected by the transport change.

**Why this priority**: Protects an existing money-adjacent invariant (INV-021: single-transaction persistence) from being weakened as a side effect of the transport refactor. Lower priority than P1s only because it's a preservation requirement, not new user-facing value — but it is non-negotiable.

**Independent Test**: Force a mid-stream failure (e.g. a tool call that errors, or a scripted planner failure) and confirm the database has no itinerary document and no PMF event recorded for that attempt.

**Acceptance Scenarios**:

1. **Given** the planner fails after emitting one or more progress updates, **When** the failure is surfaced to the client, **Then** no itinerary document and no `trip_created` event exist in storage for that attempt.
2. **Given** the client disconnects (e.g. navigates away) mid-stream, **When** the server-side draft attempt subsequently succeeds or fails, **Then** the persistence outcome is identical to what it would have been had the client stayed connected — the write decision is never made contingent on the client still listening.

### Edge Cases

- What happens when the live LLM's tool loop fails on the very first call (no progress ever emitted)? The client must still reach a clear failure state, not hang waiting for a first event that never comes.
- What happens when a progress event arrives after the client has already given up (e.g. slow event delivered after a client-side timeout/unmount)? It must be safely ignorable, not crash the UI.
- How does the system handle an agent submitting a second draft while a first is still streaming? Existing behavior (the form disables submission while `drafting`) is preserved — this feature does not introduce concurrent in-flight drafts from the same form.
- What happens on the keyless FakeLLM path, which currently resolves quickly with no real network latency? It must still satisfy the "streams progress" contract in shape (so both paths share one client code path) without introducing artificial delay that slows down local dev or the test suite.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST deliver the itinerary-drafting result to the client incrementally (progress updates followed by a final outcome) rather than as a single response sent only after all planning work completes.
- **FR-002**: The system MUST emit at least one progress update per distinct planning lookup performed during a draft attempt (hotel search, activity search, transfer quote, car-rental quote, final submission), when those lookups occur.
- **FR-003**: The final outcome delivered to the client (drafted itinerary + budget fit, or a specific failure/refusal reason) MUST be identical in content and meaning to what the equivalent non-streaming request would have produced.
- **FR-004**: The system MUST NOT persist the canonical itinerary document or record the `trip_created` event unless the full draft → verify → assemble sequence succeeds, regardless of how many progress updates were emitted or whether the client is still connected — the single-transaction persistence contract is unchanged.
- **FR-005**: The keyless (FakeLLM) drafting path MUST continue to produce byte-for-byte the same final drafted itinerary / failure outcome it produced before this feature, for every existing scripted test scenario.
- **FR-006**: The client UI MUST render at least one distinct progress state to the agent before the final result appears, when the draft takes more than a trivial amount of time (i.e., the UI is no longer a single static message for the whole request).
- **FR-007**: The client UI MUST correctly transition to the final "drafted" or "failed" view regardless of how many (zero or more) progress updates were received first, and MUST NOT get stuck in a permanent progress state if the stream ends without an explicit final event (a stream that ends abnormally is treated as a failure).
- **FR-008**: Progress updates MUST NOT expose any information beyond what is already visible in the final result or already known to the requesting agent (e.g. no leaking of other agencies' data, no raw internal tool payloads); they describe *what step is happening*, not raw supplier data.
- **FR-009**: The feature MUST NOT change who is authorized to request a draft or what tenant scope it runs under — the existing agent-only, tenant-scoped authorization for drafting is preserved exactly.

### Key Entities

- **Draft progress event**: A transient, non-persisted signal describing one step of an in-flight drafting attempt (e.g. "searching hotels", "assembling itinerary"). Never stored; exists only for the duration of one request/stream.
- **Draft outcome**: The existing final result of a drafting attempt (drafted itinerary + budget fit, or a typed failure reason) — unchanged in shape and meaning by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: During a live-LLM draft that involves multiple planning lookups, an agent sees the drafting status change at least once before the final itinerary appears, in 100% of successful draft attempts.
- **SC-002**: The server begins sending data to the client before a multi-step live-LLM draft finishes, in 100% of live-LLM draft attempts — no draft request is held completely silent for its full duration.
- **SC-003**: 100% of the existing automated draft-flow test scenarios (keyless/FakeLLM path) continue to pass with unmodified final-outcome assertions.
- **SC-004**: 0 itinerary documents or `trip_created` events are ever recorded in storage for a drafting attempt that did not fully succeed, across all failure-injection scenarios exercised by tests.
- **SC-005**: The final drafted itinerary and budget-fit summary rendered to the agent are visually and structurally identical to the pre-feature rendering (same fields, same values) in a side-by-side comparison.

## Assumptions

- "Progressive visibility" means step-level progress (which lookup/phase is in flight), not token-by-token text streaming of LLM output — the planner's output is a structured tool call (`submit_itinerary_draft`), not prose, so there is no free-text generation to stream token-by-token.
- The keyless FakeLLM path is expected to emit the same *shape* of progress events as the live path (so the client has one code path to test and use), but is not required to introduce artificial delay to "look" streamed — its existing near-instant resolution is preserved.
- "Streams" is satisfied by the request handler sending data to the client incrementally as work happens, using whatever standard mechanism the existing web transport layer supports for that purpose — the specific transport mechanism is a planning/implementation decision, not a product requirement, as long as it satisfies FR-001/FR-002 and the platform's stateless-serverless-function constraint (INV-028) referenced by this ticket.
- Only the single existing drafting entry point (the agent-gated workspace itinerary draft flow) is in scope. No other LLM-calling request handler in the system is touched by this feature.
- A client that disconnects mid-stream does not cancel the in-flight server-side planning work; the server-side outcome (including the persistence decision) is determined independently of client connection state, per FR-004 and User Story 3.
