# Data Model: Stream the AI Itinerary Draft Response

**Feature**: specs/016-stream-draft-response | **Date**: 2026-07-12

No new tables, no migrations, no canonical-schema change (Constitution IV
untouched). This feature changes a request/response *transport shape* only;
the persisted canonical itinerary document and the `trip_created` PMF event
are written by unchanged code, in the same single transaction, under the
same success conditions as before this feature (see research.md R4).

## New wire-only types (never persisted)

### DraftStep (packages/llm/src/port.ts)

A closed string union naming which planning lookup is in flight:

| Value | Meaning |
|-------|---------|
| `searchingHotels` | the hotel-rate lookup is running |
| `searchingActivities` | the activity lookup is running |
| `quotingTransfer` | the transfer lookup is running |
| `quotingCarRental` | the car-rental (budget-context-only) lookup is running |
| `assembling` | tool loop finished; verifying offers, assembling to fit, and (on success) persisting |

Carries no payload beyond the step name — no supplier ids, no prices, no raw
tool-call content (FR-008; Constitution V — no supplier API shape crosses a
package boundary).

### DraftProgressEvent (packages/llm/src/port.ts)

```
{ type: "progress"; step: DraftStep }
| { type: "result"; result: DraftItineraryResult }
```

Yielded by `LLMPort.draftItinerary`, in order, zero-or-more `"progress"`
events followed by exactly one `"result"` event. Transient — exists only for
the lifetime of one draft attempt's async generator; never stored.

### DraftEvent (packages/api/src/services/planner.ts)

The service-layer analogue, re-exported to the router/UI:

```
{ type: "progress"; step: DraftStep }
| { type: "result"; outcome: DraftOutcome }
```

`DraftOutcome` is the **existing, unchanged** union
(`{status:"drafted"; itinerary; fit}` | `{status:"infeasible"; reason}` |
`{status:"planner_failed"; reason}`) already returned by today's mutation —
only the delivery mechanism (one terminal streamed event vs. a resolved
promise) changes, not its shape or meaning.

## Entities consumed (existing, unchanged)

This feature reads and writes exactly the same entities
`packages/api/src/services/planner.ts` already touches (itinerary document,
`trip_created` PMF event) — see specs/005-budget-quote-book/data-model.md
for their shape. Nothing here adds, removes, or reinterprets a persisted
field.

## State transitions

None at the data layer. The only "state machine" this feature introduces is
the client-side view state already described in research.md R5
(`idle → drafting (zero or more progress steps) → drafted | failed`), which
is UI-local React state, not persisted domain state.
