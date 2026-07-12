# Research: Stream the AI Itinerary Draft Response

## R1. Streaming transport

**Decision**: Use tRPC v11's native SSE subscription support. Convert
`workspace.itinerary.draft` from `.mutation()` to `.subscription()`, backed
by an async-generator resolver. The browser client adds a `splitLink`
routing subscription-type operations through `httpSubscriptionLink`
(EventSource-over-fetch, GET request, `Accept: text/event-stream`) while
queries/mutations keep using the existing `httpBatchLink`. The existing
`@trpc/server/adapters/fetch` mount (`apps/web/app/api/trpc/[trpc]/route.ts`)
already handles SSE subscription requests transparently — no separate route
or adapter is needed.

**Rationale**: `@trpc/server`/`@trpc/client` are already pinned to `11.18.0`
(confirmed installed: `@trpc/server@11.18.0` exports `sse`, `tracked`, and
`AnySubscriptionProcedure` from its public entrypoint), so this needs zero
new dependencies. It keeps the "one mounted `/api/trpc` surface" invariant
(INV-018 — mobile shares the same surface) intact: no bespoke second
endpoint, no new auth/context wiring. The fetch adapter is already a
stateless per-request handler, so an SSE subscription request is just
another stateless request that stays open only for the duration of one
draft attempt — it does not require a long-lived server process or
in-process cross-request state, so it does not violate INV-028's
Vercel/serverless constraint.

**Alternatives considered**:
- **Bespoke `ReadableStream` Next.js route, bypassing tRPC** — rejected.
  Would duplicate the auth/context derivation, input validation, and
  error-shape mapping tRPC already provides for every other procedure, and
  fragments the single mounted API surface that INV-018 relies on.
- **Client-side polling of a `progress` query** — rejected. Polling cannot
  satisfy "the server has already sent data before the final result is
  ready" (SC-002) without an arbitrarily short poll interval, and adds
  latency + extra request volume for no benefit over a transport the stack
  already supports natively.
- **WebSockets** — rejected outright: a WS server needs a persistent
  connection held by a long-lived process, which is exactly what INV-028
  prohibits for the P0 Vercel serverless/edge deploy target.

## R2. Where progress originates (LLMPort contract)

**Decision**: Change `LLMPort.draftItinerary` from
`(req) => Promise<DraftItineraryResult>` to
`(req) => AsyncGenerator<DraftProgressEvent>`, where
`DraftProgressEvent = { type: "progress"; step: DraftStep } | { type: "result"; result: DraftItineraryResult }`.
The generator yields zero or more `"progress"` events as each supply lookup
starts, then yields exactly one terminal `"result"` event and returns. Both
`LLMPort` implementations change:
- `AnthropicLLM.draftItinerary` iterates the existing
  `client.beta.messages.toolRunner` async generator (unchanged tool
  wiring/bounded-iteration cap) and yields a `"progress"` event whenever a
  message's content contains a `tool_use` block, mapping the Anthropic tool
  name to a `DraftStep`. The existing usage-metering and
  captured-draft/failure logic is unchanged, just moved to run after the
  loop and expressed as the final yielded event instead of a returned value.
- `FakeLLM.draftItinerary` performs the same lookups it does today (hotels,
  activities, transfer, car-rental context) but sequentially instead of via
  `Promise.all`, yielding a `"progress"` event immediately before each call.
  The final constructed `PlannerDraft` / failure reason is byte-for-byte
  identical to today's logic — only the internal call ordering (not the
  result) changes, and only within a deterministic fake with no real network
  latency, so no test that asserts on `draftCalls` ordering or final output
  is affected in substance (verified against `packages/llm/src/__tests__/planner.test.ts`
  during implementation).

**Rationale**: Keeping progress emission at the `LLMPort` boundary (rather
than bolting it onto the tRPC layer only) means both the live and fake
implementations produce the same event shape, so the calling code
(`packages/api/src/services/planner.ts`) and the tRPC procedure have exactly
one code path regardless of which `LLMPort` is injected — directly serving
FR-005 (fake path parity) and the assumption that both paths share one
client code path.

**Alternatives considered**:
- **Callback-based `onProgress` option on `DraftItineraryRequest`** —
  rejected. Bridging a callback into an async-generator yield stream
  requires an ad hoc queue/event-emitter adapter at every call site, adding
  incidental complexity; an async generator is the direct, idiomatic
  expression of "a sequence of things happen over time, then a final
  result," and callers can trivially forward it into the tRPC subscription.
- **Keep `draftItinerary` a `Promise` and stream only at the transport layer
  by wrapping the whole call in a single "loading" SSE event plus a final
  result** — rejected. This satisfies FR-001 (incremental delivery) in the
  most technical sense but not FR-002 (per-lookup progress) or User Story 1,
  which is the actual point of the ticket.

## R3. Progress step vocabulary

**Decision**: A closed, descriptive `DraftStep` union:
`"searchingHotels" | "searchingActivities" | "quotingTransfer" | "quotingCarRental" | "assembling"`.
These map 1:1 to the planner's existing tool names
(`search_hotel_rates`, `search_activities`, `quote_transfer`,
`quote_car_rental`) plus one synthetic `"assembling"` step covering both the
live path's `submit_itinerary_draft` tool call and the fake path's
equivalent final construction step, and (in `planner.ts`) the
post-LLM verify/assemble/persist phase.

**Rationale**: Satisfies FR-008 (progress events describe *what step is
happening*, never raw supplier data) by construction — the union has no
payload beyond the step name. It gives the UI (User Story 1) exactly the
five labels named in the spec's example ("Searching hotels…", "Searching
activities…", "Pricing transfers…", …, "Assembling your itinerary…").

**Alternatives considered**: Passing through the raw Anthropic tool-call
content blocks (tool name + input JSON) — rejected, violates FR-008 and
Constitution V (no supplier-shaped data crossing package boundaries; here
it would also leak internal tool-call structure to the browser for no
product value).

## R4. Persistence-contract preservation (INV-021)

**Decision**: `packages/api/src/services/planner.ts`'s `draftItinerary`
orchestration function becomes an async generator that forwards every
`"progress"` event it receives from the injected `LLMPort`, then — exactly
as today — runs the pure re-verification + assembly + the single
`db.transaction(...)` write (canonical document + `trip_created` PMF event)
only once assembly succeeds, and finally yields one terminal
`{ type: "result"; outcome: DraftOutcome }` event carrying the *existing*
`DraftOutcome` union (`drafted` / `infeasible` / `planner_failed`)
unchanged in shape. The infeasible-budget short-circuit (computed by the
pure `allocateBudget` call, before the `LLMPort` is ever invoked) yields
zero progress events and goes straight to the terminal event — this is the
existing "fails on the very first call" edge case from the spec, handled
for free because the generator simply hasn't yielded anything yet.

**Rationale**: The transaction write is unchanged code, executed exactly
once, after exactly the same success conditions as today; only the
*shape of the function* (generator vs. promise) and *when intermediate
information becomes visible to the caller* change. This directly satisfies
FR-004 and User Story 3 — persistence never becomes contingent on how many
progress events fired or whether the client is still attached, because the
write logic doesn't read generator/subscription state at all.

## R5. Client-side subscription handling

**Decision**: `apps/web/app/(workspace)/workspace/planner.tsx` replaces
`await trpc.workspace.itinerary.draft.mutate(...)` with
`trpc.workspace.itinerary.draft.subscribe(mapped.request, { onData, onError, onComplete })`.
`onData` distinguishes `"progress"` (updates a `step` field on the
`{phase:"drafting"}` view state, driving the progress label) from
`"result"` (transitions to `"drafted"`/`"failed"`, reusing the exact
existing `draftFailureMessage`/`draftErrorMessage` mapping helpers and
`onDrafted?.()` signal — unchanged). The subscription handle returned by
`.subscribe(...)` is stored and explicitly unsubscribed on `onComplete`,
`onError`, and component unmount, so a late-arriving event after unmount is
a no-op (guards the "client disconnects/unmounts mid-stream" edge case)
rather than a React state-update-after-unmount warning or crash.

**Rationale**: This is the smallest change that satisfies User Story 1 and
FR-006/FR-007 — it reuses every existing pure mapping helper
(`lib/planner-form.ts`) and every existing result-rendering component
(`DraftResult`, `BookingFlow`, `ShareControl`) untouched, per FR-003 (final
outcome content unchanged) and the Pre-Write "extend, don't rewrite" bias.

**Alternatives considered**: A React Query-style subscription hook (tRPC
offers `useSubscription` under the React Query integration) — not
available here; this codebase's browser client
(`apps/web/lib/trpc/client.ts`) is a plain `createTRPCClient`, not the React
Query wrapper (`createTRPCReact`), so imperative `.subscribe()` matches the
existing calling convention used by every other mutation in this file
already (`trpc.workspace.itinerary.draft.mutate(...)` today).
