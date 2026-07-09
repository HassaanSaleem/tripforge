# Data Model: Booking Flow UI — Quote → Review → Book

**Feature**: specs/009-booking-flow-ui | **Date**: 2026-07-09

This feature persists nothing and defines no new server entities. It projects the
existing spec 005 booking contract into view models and pins the failure → message
mappings (FR-006). Server truth (holds, bookings, components, ledger) is owned by
spec 005 and untouched.

## Consumed server shapes (owned by spec 005 — reference only)

- **Quote input**: `{ itineraryId: uuid, markupBps: int 0–10000 (default 1500) }`
- **Quote outcome**: `{ status: "quoted", items: QuoteItemOutcome[] }` or
  `{ status: "not_found" }` (surfaced as tRPC NOT_FOUND)
  - `QuoteItemOutcome` = `{ itemId, outcome: "held", quote: HeldQuote }` |
    `{ itemId, outcome: "failed", reason: "unknown_offer" | "no_rate" | "already_booked" }`
  - `HeldQuote` = `{ quoteRowId, netMinor, netCurrency, rate?, sellMinor, currency,
    markupBps, merchantOfRecord, expiresAt }`
- **Book input**: `{ itineraryId: uuid, quoteRowIds: uuid[] (min 1) }`
- **Book outcome**: `{ status: "confirmed" | "partially_confirmed" | "failed",
  bookingId?, components: BookComponentOutcome[] }` or `not_found` → NOT_FOUND
  - `BookComponentOutcome` = confirmed `{ quoteRowId, itemId, supplierBookingId,
    netMinor, netCurrency, sellMinor, currency, merchantOfRecord }` | failed
    `{ quoteRowId, itemId, reason: "quote_expired" | "supplier_rejected" |
    "unknown_quote" | "already_consumed" | "item_already_booked" }`

All types reach the client via router inference (research D1) — never re-declared.

## View models (client-only, `apps/web/lib/booking-flow.ts` + component state)

### ItemMeta (research D4)

| Field | Type | Source |
|-------|------|--------|
| title | string | canonical document item |
| kind | "stay" \| "activity" \| "transfer" | canonical document item |

Built as `Map<itemId, ItemMeta>` from the rendered draft; display-only join.
Unknown ids fall back to the raw item id.

### MarkupFormValue (research D5)

| Field | Type | Rule |
|-------|------|------|
| markupPercent | string (controlled input) | default "15"; mapped by `toMarkupBps` |

`toMarkupBps(raw)` → `{ bps }` | `{ error }`: refuses empty/non-finite values,
percent < 0 or > 100, and values not representable as an integer basis point
(percent × 100 must round-trip within numeric tolerance, e.g. "12.345" → error).
`{ bps }` is always an integer 0–10000.

### BookingViewState (research D3)

```
idle
→ quoting                       (quote in flight; actions disabled)
→ reviewed { items }            (quote response rendered; selection active)
→ booking                       (book in flight; actions disabled)
→ concluded { outcome }         (book response rendered; re-quote available)
failed { message }              (transport error; re-quote available)
```

Selection: `Set<quoteRowId>`, reset to all held quoteRowIds on every quote
response. The book action is enabled only in `reviewed` with a non-empty
selection.

## Message mapping tables (FR-006 — pinned by L1 tests, exhaustive over unions)

### Quote item failures (`quoteFailureMessage`)

| reason | message |
|--------|---------|
| unknown_offer | "This option is no longer available from the supplier. Draft again or re-quote to refresh." |
| no_rate | "No exchange rate to the trip currency is available for this item." |
| already_booked | "Already booked — this item is covered by an existing booking." |

### Book component failures (`bookFailureMessage`)

| reason | message |
|--------|---------|
| quote_expired | "The price hold expired before booking. Quote again for fresh prices." |
| supplier_rejected | "The supplier declined this booking. Quote again and retry." |
| unknown_quote | "The supplier no longer recognizes this hold. Quote again for fresh prices." |
| already_consumed | "This hold was already used by another booking." |
| item_already_booked | "This item is already booked — it was not booked twice." |

### Booking status (`bookStatusLabel`)

| status | label |
|--------|-------|
| confirmed | "Booking confirmed" |
| partially_confirmed | "Booking partially confirmed" |
| failed | "Booking failed — nothing was booked" |

### Transport / authorization (`transportErrorMessage` via `transport-error.ts`, research D6)

| condition | message (booking wording) |
|-----------|---------------------------|
| UNAUTHORIZED | "Your session has expired. Please sign in again." *(shared string)* |
| FORBIDDEN | "Booking requires an agency membership. Sign in with your agency account." |
| BAD_REQUEST | "The server rejected the booking request. Refresh the quotes and try again." |
| NOT_FOUND | "This itinerary is no longer available in your workspace." |
| anything else / network | "Could not reach the server. Check your connection and try again." *(shared string)* |

`draftErrorMessage` (spec 008) delegates to the same helper with its existing
FORBIDDEN/BAD_REQUEST wording and no NOT_FOUND override; every string it returns
today is unchanged (existing L1 tests must pass untouched).

## Display formatting rules (FR-007)

- Money: `formatMinorAmount(amountMinor, currency)` — the exact server integer,
  reused from planner-form (research D7). No sums, no totals, no conversions.
- Markup shown on held rows: the server-returned `markupBps` rendered as a
  percentage string by pure formatting (`markupBps / 100` is a display-scale
  operation on a rate, not money arithmetic; pinned by an L1 test to exact
  string output, e.g. 1500 → "15%").
- Expiry: `formatHoldExpiry(expiresAt)` → "Held until {local time}" (research D7).
