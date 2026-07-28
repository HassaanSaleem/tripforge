# Data Model: Traveler Self-Drive Booking

**No new tables, no new columns, no migration.** Self-book writes exactly the
existing money-path rows the agent path writes.

## Tables touched (all existing)

| Table | Role in self-book | Written by | Tenant key |
|-------|-------------------|------------|------------|
| `itinerary_share_link` | token → `{agencyId, itineraryId}` resolution | read only | `agency_id` |
| `itinerary` | the shared document (canonical, re-validated on read) | read only | `agency_id` |
| `booking_quote` | firm-price holds created by the quote step; markup source | insert (quote) / update `consumed_at` (book) | `agency_id` (itinerary's) |
| `booking` | the booking envelope (status) | insert | `agency_id` (itinerary's) |
| `booking_component` | one confirmed leg (net, sell, rate, MoR, supplier id) | insert | `agency_id` (itinerary's) |
| `markup_ledger` | realized margin `markup = sell − net` | insert | `agency_id` (itinerary's) |
| `pmf_event` | `booking_confirmed` per leg (GBV) | insert | `agency_id` (itinerary's); `actor_user_id` = traveler |

**Key invariant**: every write carries `agency_id = itinerary's owning agency`
(from the share link), NOT the traveler's session (a traveler has no agency).
`pmf_event.actor_user_id` = the signed-in traveler's `user.id` (a real row; the
FK holds). This is the only difference from an agent-initiated booking — the
actor is the traveler, the tenant is still the agency.

## Types (code-level, transient)

### `BookingActor` (new type — not persisted)

```
BookingActor = Pick<AgentSessionContext, "agencyId" | "userId">
```

The tenant scope the booking services actually use. `AgentSessionContext` is a
structural subtype, so the agent path passes its full session unchanged.

### `SelfBookOutcome` (new — returned to the browser, not persisted, redacted)

```
type SelfBookLeg =
  | { itemId; title; kind: "stay"|"activity"|"transfer"; outcome: "confirmed"; sellMinor; currency }
  | { itemId; title; kind; outcome: "failed"; reason: "price_changed"|"supplier_unavailable"|"already_booked" }

type SelfBookOutcome =
  | { status: "not_found" }
  | { status: "nothing_to_book" }
  | { status: "confirmed"|"partially_confirmed"|"failed";
      legs: SelfBookLeg[];
      totalChargedMinor: number;   // sum of confirmed sellMinor
      currency: string }
```

**Redaction (FR-008)**: no `netMinor`, `markupBps`, `merchantOfRecord`,
`supplierBookingId`, `offerId`, or `supplyRef` may appear. `title`/`kind` come
from the canonical document; `sellMinor` is the client price already shown in the
trip view; `reason` is a mapped client-safe enum, never a raw internal reason.

## State transitions (per leg, inherited from the money path)

```
bookable & un-booked ──quote──▶ held (booking_quote, consumed_at=null)
held ──book success──▶ confirmed (consumed_at set; booking_component + markup_ledger + pmf_event)
held ──book failure──▶ released (consumed_at cleared; NO component/ledger/event)   ← conservation (FR-006/INV-011)
already booked ──quote──▶ skipped (reason: already_booked)                         ← no duplicate (FR-007)
```

- **Partial failure**: confirmed legs recorded once; failed legs released, zero
  money rows, not counted in `totalChargedMinor`.
- **Total failure**: `bookItinerary` returns `failed` and writes nothing (the
  all-fail conservation branch) — zero new rows for the itinerary.
- **Concurrency**: RESERVE-then-book + `UNIQUE(itinerary_id, item_id)` on
  `booking_component` guarantee at-most-once per item across concurrent
  self-book/agent-book.
