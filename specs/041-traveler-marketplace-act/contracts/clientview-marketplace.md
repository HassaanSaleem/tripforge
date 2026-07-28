# Contract: `clientView.marketplace` (traveler surface)

New sub-router mounted on the existing `clientView` router (mirrors `clientView.groups`). Both
procedures are traveler-facing. Downstream self-book and request-agent are the EXISTING
`clientView.selfBook` / `clientView.requestHandoff` procedures, reached from `/view/[token]` —
NOT redefined here.

## `clientView.marketplace.browse` — query (public)

Read-only, allowlist-projected browse of active marketplace listings for a traveler.

- **Auth**: `publicProcedure` (browsing needs no sign-in; acting does). Anonymous may browse.
- **Input**: none.
- **Output**: `TravelerMarketplaceCard[]`

```ts
interface TravelerMarketplaceCard {
  listingId: string;      // opaque id used by fork
  title: string;          // trip title (client-safe)
  agencyName: string;     // selling agency display name
  sellerVetted: boolean;  // verified-seller badge
  currency: string;
  fromTotalMinor: number | null;  // client-facing "from" total (toClientItineraryView), null if unpriced
}
```

- **Projection rule (INV-020)**: ONLY the fields above. `marketplace_listing.price_minor`
  (agent license price), `revenue_share_bps`, `license_terms`, and every net/markup value are
  structurally absent. `fromTotalMinor` is computed identically to the trip view's total.
- **Scope**: cross-tenant read of `status = 'active'` listings (the one documented cross-tenant
  read pattern), ordered newest-first.

## `clientView.marketplace.fork` — mutation (protected)

Fork an active listing into a seller-agency-owned copy attached to the signed-in traveler.

- **Auth**: `protectedProcedure` (any authenticated user; anonymous → `UNAUTHORIZED`). FR-008.
- **Input**: `{ listingId: string (uuid) }`
- **Output**: `ForkListingOutcome`

```ts
type ForkListingOutcome =
  | { status: "forked"; token: string; path: string }   // path = `/view/${token}` — the copy's trip view
  | { status: "not_available" };                          // unknown/inactive listing or missing source (FR-009)
```

- **Effect (one transaction)**: validate listing `active`; load source itinerary; insert copy
  itinerary (`agency_id` = seller, `document` = `travelerForkCopy(source, {copyId})` re-validated,
  `creation_source` inherited, `trip_request` inherited); insert `itinerary_share_link`
  (seller, copy) → token; insert `client_trip_link` (traveler, copy, source `"fork"`,
  onConflictDoNothing); insert `marketplace_fork` (copy, listing, source, seller, traveler).
- **Idempotency/concurrency**: each call mints a NEW copy (fresh uuid) — repeat forks by the same
  traveler create distinct copies (a traveler may plan the same trip twice); no cross-traveler
  collision (FR-004/SC-004). `client_trip_link` onConflict guards only the (traveler, copy) pair.
- **Refusal surface**: `not_available` is neutral for both unknown and inactive/missing-source —
  no existence oracle (FR-009).

## Downstream (reused, unchanged)

| Step | Procedure | Notes |
|------|-----------|-------|
| View the forked copy | `clientView.itinerary({ token })` | redacted `ClientItineraryView` (INV-020) |
| Attach on view | `clientView.attachTrip({ token })` | idempotent; keeps `source="fork"` |
| Self-book | `clientView.selfBook({ token })` | books copy items at **source seller markup** via fork-aware `deriveMarkupBps`; seller keeps markup; no take-rate (FR-010/011/012/013) |
| Request an agent | `clientView.requestHandoff({ token, contactName, ... })` | routes to the copy's owning seller agency (FR-014) |
