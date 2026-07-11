# Data Model: Workspace Itinerary List (spec 012)

No new entities, tables, columns, or schema versions. The feature consumes
two EXISTING read-side projections verbatim; they are documented here as the
panel's data contract. Canonical itinerary schema: untouched (Constitution
IV; SCHEMA_VERSION stays 0.1.0).

## Consumed projection 1 — Itinerary list entry

Source: `workspace.itinerary.list` → `listItineraries`
(`packages/api/src/services/itineraries.ts`), tenant-scoped by
`scopedWhere(itineraryTable.agencyId, session.agencyId)` (INV-004), ordered
`createdAt DESC` server-side.

| Field | Type | Panel use |
|-------|------|-----------|
| `id` | string (uuid) | Open action key; React key |
| `title` | string | Row title |
| `currency` | string (ISO-4217) | Currency badge (verbatim) |
| `createdAt` | string (ISO-8601) | Formatted via `formatCreatedDate` (D6) |

Constraints the panel relies on (all pre-existing, L3-pinned):
- Exactly the caller agency's rows — cross-tenant rows unreachable by
  construction.
- Newest first — panel performs NO client-side re-sorting.
- Projection-only — no canonical document in list rows.
- NEW L3 pin (this feature): after a license, the buyer's list contains the
  white-label copy row (id from the license receipt).

## Consumed projection 2 — Itinerary overview (open view)

Source: `workspace.itinerary.get` → `itineraryOverview`
(`packages/api/src/services/booking.ts`), same tenant scoping; cross-tenant
probe → `NOT_FOUND` (no existence oracle).

| Field | Type | Panel use |
|-------|------|-----------|
| `itinerary` | canonical `Itinerary` document | Day-by-day render (`ItineraryDays`, D5); input to `BookingFlow` |
| `tripRequest` | `TripRequest` | Not rendered in v0 |
| `quotes[]` | quote summaries (sellMinor, currency, expiresAt, consumed) | Not rendered in v0 — `BookingFlow` manages its own quote state |
| `bookings[]` | `{bookingId, status, createdAt}` | Booking-status line, strings rendered verbatim |

Money display rule (FR-009 / SC-004): every amount rendered comes from a
server-provided minor-unit integer passed through the existing
`formatMinorAmount` — the panel introduces zero arithmetic (no sums, no
conversions, no derived values).

## Client-side view state (ephemeral, per component — not persisted)

```text
ListState  = loading | loaded(entries[]) | failed(message)
OpenState  = closed | loading(id) | opened(id, overview) | failed(id, message)
refreshToken: number — bumped by Planner's onDrafted (D2); re-runs the list load
```

State transitions:
- mount → loading → loaded | failed
- refreshToken bump → loading (list reloads; open view unaffected)
- open(id) → loading(id) → opened | failed  (failure keeps the list visible)
- back → closed (list state retained as-is)
