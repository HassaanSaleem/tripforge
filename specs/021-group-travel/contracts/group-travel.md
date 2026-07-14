# Contract: `workspace.groupTravel.*` (tRPC)

All procedures are `agentProcedure`-gated (INV-023/024): anonymous → 401 UNAUTHORIZED;
traveler (no agency) → 403 FORBIDDEN. Business refusals are typed VALUES in the response
(marketplace-router precedent); TRPCErrors are reserved for auth/validation/not-found. All
money is integer minor units + currency (INV-009).

## §1 `post` (mutation) — FR-001/002/003

Input (zod, strict):

```ts
{
  itineraryId: uuid,          // must be owned by caller's agency (tenant-scoped)
  departureDate: string (ISO date),
  capacity: int > 0,
  pricePerSeatMinor: int >= 0, // in the itinerary's currency
}
```

Outcomes (discriminated on `status`):

- `{ status: "posted", departureId, seatsRemaining, capacity }`
- throws a zod parse error — capacity <= 0 or price < 0 (input-schema bounds,
  `createListingInputSchema` precedent: no runtime "invalid" status needed
  when the bound is enforceable at the input boundary).
- throws `NOT_FOUND` — itinerary absent or not owned by caller's agency.

## §2 `cancel` (mutation) — FR-004

Input: `{ departureId: uuid }`. Posting-agency-only (tenant-scoped).

- `{ status: "cancelled", departureId }`
- `{ status: "already_cancelled", departureId }`
- throws `NOT_FOUND` — departure absent or not the caller's.

## §3 `browse` (query) — FR-008

Input: `{}` (v0 — no filters/pagination). Cross-tenant BY DESIGN (marketplace-browse
precedent, spec 006 research D7): returns only `status = 'active'` departures projected to
public fields.

```ts
{ departures: Array<{
    departureId, itineraryTitle, departureDate,
    capacity, seatsRemaining, pricePerSeatMinor, currency,
    postingAgencyId, postingAgencyName,
    sellerVetted: boolean,     // reuses vettedAgencyIds projection (demo-07)
    mine: boolean              // caller is the posting agency
} > }
```

## §4 `join` (mutation) — FR-005/006/007, capacity-conservation gate

Input:

```ts
{
  departureId: uuid,
  travelerName: string (1..200),
  travelerEmail: string (optional, email format),
}
```

One database transaction: atomic conditional `UPDATE group_departure SET seats_remaining =
seats_remaining - 1 WHERE id = $1 AND status = 'active' AND seats_remaining > 0 RETURNING
seats_remaining, price_per_seat_minor, currency` — zero rows returned means the claim lost
(sold out / inactive); one row returned means the caller won the seat and the transaction
proceeds to insert the `group_departure_seat` row using the RETURNED price/currency snapshot,
then records the `group_departure_seat_joined` PMF event. No supplier call, no quote/hold —
the price is fixed at post time (research D1, D6).

Outcomes:

- `{ status: "joined", seatId, seatsRemaining, seatPriceMinor, currency }`
- `{ status: "sold_out" }` — `seatsRemaining` was already 0 (including the losing side of a
  concurrent last-seat race — exactly one of two concurrent callers gets `joined`, the other
  `sold_out`; SC-002).
- `{ status: "not_active" }` — departure cancelled.
- throws `NOT_FOUND` — departure does not exist.

## §5 Marketplace license transaction — additive (no new procedure)

`workspace.marketplace.licenseListing` (spec 006 contract §4, UNCHANGED input/output shape)
gains one additive internal step (FR-010): inside the SAME transaction, after the white-label
itinerary copy is inserted, if the source itinerary has an `active` `group_departure` row, a
new `group_departure` row is inserted for the copy (`agencyId = actor.agencyId`, same
`departureDate`/`pricePerSeatMinor`/`currency`, `capacity` = the original's `capacity`,
`seatsRemaining = capacity`). This step is a no-op (and therefore invisible to callers) when
the licensed itinerary is not a group departure — zero contract change for ordinary listings.
