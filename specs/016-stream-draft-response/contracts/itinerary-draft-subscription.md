# Contract: workspace.itinerary.draft — subscription amendment

**Feature**: specs/016-stream-draft-response | **Amends**: specs/005-budget-quote-book
contracts (procedure kind + response shape only — input, authorization, and
final-result semantics are unchanged)

## Procedure

`workspace.itinerary.draft` — **changes from a `mutation` to a
`subscription`**. Same router path, same `agentProcedure` authorization gate
(INV-023/INV-024 unchanged: agent-only, tenant-scoped via
`ctx.session.agencyId`), same input schema (`tripRequestSchema`, unchanged —
destination/dates/party/tripStyle/budget).

## Output stream (new shape)

An ordered sequence of `DraftEvent` (see data-model.md), delivered over SSE:

1. Zero or more:
   ```
   { type: "progress", step: "searchingHotels" | "searchingActivities" | "quotingTransfer" | "quotingCarRental" | "assembling" }
   ```
2. Exactly one, terminal:
   ```
   { type: "result", outcome: DraftOutcome }
   ```
   where `DraftOutcome` is **byte-for-byte the same union** the mutation
   returns today:
   - `{ status: "drafted"; itinerary: Itinerary; fit: AssembleResult["fit"] }`
   - `{ status: "infeasible"; reason: "budget_below_reserve" | "no_days" }`
   - `{ status: "planner_failed"; reason: "malformed_output" | "no_proposals" }`

The subscription completes (server closes the stream) immediately after the
`"result"` event. No `tracked()`/`lastEventId` resumability is offered or
required — a dropped connection is not resumed; the caller submits a fresh
draft request if it needs the result (this repo's UI never needs
resumability, per spec Assumptions: a client disconnect doesn't change the
server-side persistence outcome, and this is a one-shot user-initiated
action, not a durable feed).

If the underlying draft attempt throws unexpectedly (a defect, not a typed
business failure), the subscription ends with a tRPC error exactly as the
mutation would have today — thrown errors are not a `DraftEvent`, they use
tRPC's existing SSE error-frame mechanism.

## Client contract

`trpc.workspace.itinerary.draft.subscribe(input, { onData, onError, onComplete })`
replaces `trpc.workspace.itinerary.draft.mutate(input)`. `onData` receives
`DraftEvent` values in the order above. Exactly one `onData` call carries
`type: "result"`; the caller MUST treat that call (or `onError`/the stream
ending without a `"result"` event, per FR-007) as terminal and stop waiting.

## Invariants preserved (unchanged, re-asserted by existing + new tests)

- **Authorization**: agent-only, tenant-scoped — identical gate, identical
  `FORBIDDEN`/`UNAUTHORIZED` behavior for a non-agent/anonymous caller.
- **Persistence (INV-021)**: the canonical itinerary document + `trip_created`
  PMF event are written in ONE transaction, only on `status: "drafted"`,
  regardless of client connection state (FR-004).
- **No client money arithmetic**: unchanged — the final `itinerary`/`fit`
  payload is exactly what the mutation returned; the UI still only formats
  server-computed integers.
- **FakeLLM parity (FR-005)**: the keyless path emits the same `DraftEvent`
  shape and produces the identical final `DraftOutcome` as before this
  feature, for every existing scripted planner test.

## Verification hooks

- L1/L2: `packages/llm/src/__tests__/planner.test.ts` — both `AnthropicLLM`
  (tool-loop message → progress-step mapping) and `FakeLLM` (sequential
  lookups → progress-step-per-lookup) emit the expected `DraftProgressEvent`
  sequence and an unchanged terminal result, for drafted / infeasible /
  planner_failed cases.
- L2: a router-level test drives `itineraryRouter.draft` as an async
  iterable/subscription caller and asserts the event sequence + terminal
  `DraftOutcome`, plus that an infeasible-budget request short-circuits with
  zero progress events straight to the terminal event.
- L3: existing draft-flow integration test(s) updated to consume the
  subscription and assert the same final persisted state (itinerary row +
  `trip_created` event) as before, including a failure-path assertion that
  nothing is persisted (state-conservation, per the quality bar's money-path
  rule — drafting isn't a money path itself, but persistence-on-failure is
  the same class of invariant).
- e2e/live: Playwright drives the planner form and asserts at least one
  visible intermediate progress state renders before the final drafted
  result, then that the final rendered result matches today's output.
