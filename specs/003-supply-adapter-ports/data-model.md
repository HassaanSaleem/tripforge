# Phase 1 Data Model: Supply Adapter Port Family

All types live in `packages/supply-adapter/src/ports/` (INV-005). Money is
`@tripforge/domain`'s `Money` (integer minor units + currency, INV-009). No
entity here is persisted; live quotes exist only in memory with an explicit
expiry (INV-026 carve-out). No canonical-schema entity changes (D-006).

## Common vocabulary (`ports/common.ts`)

| Type | Shape | Notes |
|------|-------|-------|
| `MerchantOfRecord` | `"platform" \| "agency" \| "supplier"` | Closed set (research D7); declaration only at P0 |
| `SupplyContent` | `{ title: string; description?: string; features?: string[] }` | Long-lived descriptive content, separated from price (FR-010); media refs join with the materialization follow-up (research D8) |
| `QuoteFailureReason` | `"unknown_offer"` | Closed set; extensible inside the package |
| `BookFailureReason` | `"quote_expired" \| "supplier_rejected" \| "unknown_quote"` | Machine-readable (FR-006) |
| `CancelFailureReason` | `"unknown_booking" \| "already_cancelled"` | Spec edge cases |
| `QuoteOutcome<TQuote>` | `{ status: "quoted"; quote: TQuote } \| { status: "failed"; reason: QuoteFailureReason }` | |
| `SupplyBooking` | `{ bookingId: string; quoteId: string }` | Identity of a confirmed booking |
| `BookingOutcome` | `{ status: "confirmed"; booking: SupplyBooking } \| { status: "failed"; quoteId: string; reason: BookFailureReason }` | Replaces seed-0001's `HotelBooking` (deletion discipline: upgraded in place, no v2-beside-v1) |
| `CancelOutcome` | `{ status: "cancelled"; bookingId: string } \| { status: "failed"; bookingId: string; reason: CancelFailureReason }` | |
| `SupplyPort<TCriteria, TOffer, TQuote>` | `search(criteria): Promise<TOffer[]>` · `quote(offerId): Promise<QuoteOutcome<TQuote>>` · `book(quoteId): Promise<BookingOutcome>` · `cancel(bookingId): Promise<CancelOutcome>` | The four verbs, defined once (research D2) |

### Offer/Quote base shapes

| Type | Shape |
|------|-------|
| `OfferBase` | `{ offerId: string; content: SupplyContent; netRate: Money }` |
| `QuoteBase` | `{ quoteId: string; offerId: string; netRate: Money; expiresAt: string /* ISO datetime */; merchantOfRecord: MerchantOfRecord }` |

## Per-component ports

Each port extends `SupplyPort` with concrete parameters; offers/quotes extend
the bases with component-specific fields. Criteria are OUR contract shapes —
never a supplier's (INV-005).

| Port | Criteria | Offer extras | Quote |
|------|----------|--------------|-------|
| `HotelPort` (`ports/hotel.ts`, upgraded in place) | `{ destination; checkIn; checkOut; guests }` (unchanged from seed-0001) | `HotelOffer = OfferBase` (former `name` field becomes `content.title`) | `HotelQuote = QuoteBase` |
| `ActivityPort` (`ports/activity.ts`) | `{ destination; date?; participants }` | `ActivityOffer = OfferBase & { durationMinutes? }` | `ActivityQuote = QuoteBase` |
| `TransferPort` (`ports/transfer.ts`) | `{ from; to; at; passengers }` | `TransferOffer = OfferBase & { mode: "private" \| "shared" }` | `TransferQuote = QuoteBase` |
| `CarRentalPort` (`ports/car-rental.ts`) | `{ pickupLocation; dropoffLocation?; pickupAt; dropoffAt; driverAge? }` | `CarRentalOffer = OfferBase & { vehicleClass: string }` | `CarRentalQuote = QuoteBase` |

Note: `TransferOffer.mode` values are a subset of the canonical
`TransferItemSchema.mode` enum (`private | shared | rail | other`) — the port
offers what suppliers sell; the schema stays authoritative for items and is
not imported here (leaf discipline, research D8).

## State transitions (sandbox lifecycle — the behavior the contract suite pins)

```
Offer (from search, or pre-seeded fixture)
  └─ quote(offerId) ──────────────► Quote { expiresAt = now + holdWindow }
       │   unknown offerId ───────► QuoteOutcome failed(unknown_offer)
       │
Quote (held)
  ├─ book(quoteId) while now < expiresAt
  │     ├─ normal offer ──────────► BookingOutcome confirmed(booking); outcome RECORDED
  │     └─ fail-book fixture ─────► BookingOutcome failed(supplier_rejected); outcome RECORDED
  ├─ book(quoteId) while now >= expiresAt ─► failed(quote_expired); nothing recorded/created
  ├─ book(unknown quoteId) ───────► failed(unknown_quote)
  └─ re-book(same quoteId) ───────► the RECORDED outcome, verbatim (idempotent, research D5)

Booking (confirmed)
  ├─ cancel(bookingId) ───────────► CancelOutcome cancelled; booking marked cancelled
  ├─ cancel(again) ───────────────► failed(already_cancelled)
  └─ cancel(unknown bookingId) ───► failed(unknown_booking)

Independence invariant (INV-007 port guarantee): no verb on quote/booking A
reads or mutates the registry entry of quote/booking B — a sibling's failure
can never invalidate a held quote.
```

## Sandbox determinism model

- Injectable clock `now: () => number` (constructor arg, defaults to
  `Date.now`) — tests advance a fake clock to cross expiry boundaries.
- IDs derived from inputs + a per-instance monotonic counter
  (`q-<offerId>-<n>`, `b-<quoteId>`): same call sequence + same clock ⇒ same
  ids, prices, outcomes. No network, no randomness (FR-007, INV-019).
- Fixtures per component with mixed currencies (research D11): hotel USD,
  activity EUR, transfer USD, car rental EUR.
- Pre-seeded well-known fixture `SANDBOX_FAIL_BOOK_OFFER_ID` in every sandbox:
  quotes normally, always books to `failed(supplier_rejected)` (research D4).
- Per-component hold windows (hotel 15 min, activity 30 min, transfer 10 min,
  car 20 min) so no consumer can assume a global TTL (research D6).

## Composition root (`packages/api`)

`Container` (packages/api/src/context.ts) gains three fields alongside the
existing `hotel`:

| Field | Port type | Default wiring (`buildContainer`) |
|-------|-----------|------------------------------------|
| `activity` | `ActivityPort` | `SandboxActivityAdapter` |
| `transfer` | `TransferPort` | `SandboxTransferAdapter` |
| `carRental` | `CarRentalPort` | `SandboxCarRentalAdapter` |

All construction goes through `buildContainer()` (verified: the only
`Container` literal in the repo), so no other callsite changes.
