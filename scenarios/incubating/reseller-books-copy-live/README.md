# Scenario: reseller-books-copy-live

Kitchen Loop iteration-3 third ideate pass (T2 Composition). The reseller
OPERATES the traded good: licenses a white-label copy from the marketplace,
quotes + books net-rate inventory inside THEIR copy at THEIR OWN markup
(2200 bps — not the seller's, not the 1500 default), mints the client share
link, and the client reads the branded booked trip.

Design intent under live test for the first time: licensing inherits
`tripRequest` "so the reseller can re-quote supply on the copy"
(`packages/marketplace/src/licensing.ts`, research D8).

## What it asserts (40 checks, L3-style 4-layer)

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
- **Price-fidelity observation (not asserted — BUG-1 of the iteration-3 third
  pass report)**: the client view's shown prices are the DOCUMENT's stored
  `sellPrice`, which the draft path sets equal to `netRate`
  (`packages/domain/src/assemble.ts` — "markup applies at quote time") and the
  quote/book flow never writes back. The traveler therefore reads the agency's
  net cost beside "Booked" badges (observed live: view total 34780 minor vs
  42431 minor booked sells). Kept as a logged observation so the scenario
  stays green on the parts whose intended behavior is settled; the fix is a
  cross-spec product decision (specs 005/010, canonical schema `item.ts`
  documents `sellPrice` as "client-facing (net + agency markup)").

## Run it

```bash
docker compose up --build --wait
BASE_URL=http://localhost:3000 node scenarios/incubating/reseller-books-copy-live/scenario.mjs
```

Exit 0 = journey passes. Operator-side arrangement (agency vetting) is done
directly against compose Postgres, same as `tests/e2e/support.ts` and the
sibling golden-path scenario.
