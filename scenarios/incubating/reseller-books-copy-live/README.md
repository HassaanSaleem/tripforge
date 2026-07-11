# Scenario: reseller-books-copy-live

Kitchen Loop iteration-3 third ideate pass (T2 Composition). The reseller
OPERATES the traded good: licenses a white-label copy from the marketplace,
quotes + books net-rate inventory inside THEIR copy at THEIR OWN markup
(2200 bps — not the seller's, not the 1500 default), mints the client share
link, and the client reads the branded booked trip.

Design intent under live test for the first time: licensing inherits
`tripRequest` "so the reseller can re-quote supply on the copy"
(`packages/marketplace/src/licensing.ts`, research D8).

## What it asserts (47 checks incl. new per-item price-fidelity assertions, seed-0033; L3-style 4-layer)

- **Booking on a copy works**: quote holds every bookable component of the
  licensed copy; book confirms each with a supplier ref.
- **Markup independence**: every held row carries the reseller's 2200 bps in
  the trip currency (exact `net × 1.22` identity for same-currency nets; FX
  rows priced in USD).
- **Money state-deltas**: the reseller's `markup_ledger` conserves
  `net + markup = sell` on every row and its sells are exactly the held-quote
  sells; the SELLER's ledger stays empty (money isolation across the trade).
- **Tenancy (INV-004)**: the reseller quoting the seller's ORIGINAL itinerary
  is refused `NOT_FOUND` with no existence oracle.
- **Client trust boundary (spec 010)**: the anonymous payload and the SSR
  `/view/<token>` page carry the RESELLER's brand only — structurally free of
  `netMinor`/`netRate`/`markupBps`/`supplierBookingId`/`supplyRef`/
  `provenance`/`agencyId`/`budget`, never naming the original seller agency or
  the platform (full surface incl. tab title, INV-020 class); booked marks
  reflect the live bookings; a guessed token resolves to the typed neutral
  `not_found`.
- **Price fidelity — hard assertion (fixed by seed-0025, promoted from an
  observation to a `check(...)` on THIS licensed-copy path by seed-0033)**:
  BUG-1 of the iteration-3 third pass report found the client view showing the
  DOCUMENT's stored `sellPrice` (equal to `netRate` at draft time) beside
  "Booked" badges instead of the realized booking sell. `client-view.ts`'s
  `bookedPriceByItemId` read-time projection (PR #36) fixed this generally;
  this scenario now asserts per-item — every booked item's shown price equals
  ITS OWN booking record's sell, zero-delta against the reseller's
  `markup_ledger` sum — confirming the fix generalizes to a licensed
  white-label copy (`whiteLabelCopy()` preserves `item.id` across the copy),
  not just a self-built original.

## Run it

```bash
docker compose up --build --wait
BASE_URL=http://localhost:3000 node scenarios/incubating/reseller-books-copy-live/scenario.mjs
```

Exit 0 = journey passes. Operator-side arrangement (agency vetting) is done
directly against compose Postgres, same as `tests/e2e/support.ts` and the
sibling golden-path scenario.
