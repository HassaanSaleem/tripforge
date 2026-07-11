# Contract: clientView.itinerary — booked-price projection amendment

**Feature**: specs/013-booked-price-fidelity | **Amends**: specs/010-client-view-share/contracts (payload pricing semantics)

## Procedure (unchanged surface)

`clientView.itinerary` — public tRPC query, input `{ token: uuid }`, output
`{ status: "not_found" } | { status: "found", view: ClientItineraryView }`.
The `/view/[token]` SSR page renders exactly this payload. Nothing about the procedure
name, input, availability semantics (typed `not_found`, no existence oracle), or error
surface changes.

## Amended pricing semantics

### Per item (`ClientViewItem.sellMinor`)

| Item state | `sellMinor` value | Presentation |
|------------|-------------------|--------------|
| Confirmed booking component exists (`booked: true`) | the component's recorded `sell_minor` (client price realized at booking: net × markup, integer minor units, itinerary currency) | confirmed price, beside the existing `Booked` badge |
| No booking; document has a pricing snapshot | the document's stored `sellPrice.amountMinor` (draft estimate — unchanged from today) | estimate marker |
| No booking; no pricing snapshot | `null` | no price shown |

The document's stored price is NEVER shown for a booked item.

### Trip total (`ClientItineraryView.totalSellMinor`)

Server-side integer-minor-unit fold (domain `addMoney`) of exactly the per-item values
above. `null` when no item contributes a price. When any contributing value is an estimate,
the page must qualify the total as including estimates.

## Invariants preserved (unchanged, re-asserted by existing tests)

- **Allowlist projection (spec 010 FR-007/SC-003)**: no `netMinor`/`netRate`/`markupBps`/
  supplier identifiers/provenance/tenant ids in the payload — in any form. The booked sell
  amount is the only new VALUE crossing, and it is client-facing by definition.
- **No client-side money arithmetic** (spec 010 FR-008): the browser formats server integers.
- **Read-only** (spec 010 FR-011): the stored document is never modified.
- **Tenant scope (INV-004)**: component reads stay scoped to the share link's agency +
  itinerary; a white-label copy's view shows only the copy owner's bookings.
- **Loud failure on impossible state**: a component whose recorded currency differs from the
  document currency fails the server-side fold (domain `MoneyError`) — never a silently
  wrong total.

## Verification hooks

- L1: `client-view-projection.test.ts` — projection prefers booked sell; estimate fallback;
  unpriced-booked item shows the booked price; mixed fold equals shown values; cross-currency
  component throws.
- L3 (real Postgres, red-witness first): `l3-client-view.test.ts` — draft → quote @ 2200 bps
  → book → `clientView.itinerary` per-item sells and total equal `markup_ledger`/
  `booking_component` sells exactly; mixed booked/un-booked case.
- e2e: `/view/<token>` shows the booked (marked-up) price and the estimate marker.
- Live scenario hard assertion: client-view booked sum == reseller `markup_ledger` sell sum.
