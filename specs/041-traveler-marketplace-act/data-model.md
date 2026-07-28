# Phase 1 Data Model: Traveler acts on a marketplace itinerary

## New table: `marketplace_fork` (bolt-on, additive, backfill-free)

A record that a traveler forked a marketplace listing into their own working copy. Bolt-on
metadata over an itinerary (the `traveler_group` / `group_departure` / `marketplace_listing`
pattern) — **NOT** a canonical itinerary schema change (`SCHEMA_VERSION` unchanged). Money-free:
it carries no net/markup/take-rate/sell columns; it only *points at* the source whose established
markup the reused self-book path reads at book time.

File: `packages/db/src/schema-marketplace-fork.ts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK, default random | |
| `copy_itinerary_id` | uuid NOT NULL, **UNIQUE**, FK → `itinerary.id` (cascade) | The forked copy. UNIQUE = one fork record per copy; the markup fallback looks up by this. |
| `listing_id` | uuid NOT NULL, FK → `marketplace_listing.id` | Which listing was forked (provenance). |
| `source_itinerary_id` | text (itineraryFk) NOT NULL | The listed source itinerary — the markup basis (bound b). |
| `seller_agency_id` | agencyRef (text, no cascade) NOT NULL | The originating/owning agency of the copy (immutable provenance). |
| `traveler_user_id` | text NOT NULL, FK → `user.id` (cascade) | The traveler who forked (audit; also the "My Trips" owner via `client_trip_link`). |
| `created_at` | timestamp NOT NULL, default now | |

Indexes: `unique(copy_itinerary_id)`; `index(traveler_user_id)`; `index(source_itinerary_id)`.

**Rationale for column choices**: `copy_itinerary_id` UNIQUE + FK-cascade so a deleted copy
removes its fork record. `seller_agency_id` uses `agencyRef` (no cascade — an immutable
provenance stamp, matching `marketplace_license.seller_agency_id`). `source_itinerary_id` stored
directly (not only via `listing_id`) so the markup fallback survives listing deactivation and is
a single indexed hop. No money columns (Constitution VI — a fork is not a trade).

## Reused tables (unchanged)

- **`marketplace_listing`** — the browse source (active rows) and the fork source. Read-only here.
- **`itinerary`** — the fork inserts one new copy row (`agency_id` = seller, `creation_source`
  inherited). No column change.
- **`itinerary_share_link`** — the fork inserts one row (`agency_id` = seller, `itinerary_id` =
  copy) so the traveler lands on `/view/[token]`. UNIQUE(itinerary_id) already the arbiter.
- **`client_trip_link`** — the fork inserts `{ user_id: traveler, itinerary_id: copy, source:
  "fork" }` (source is free `text`; `"fork"` is a new value, no schema change).
- **`booking_quote`** — read by the fork-aware `deriveMarkupBps` (source markup). Unchanged.
- **`booking` / `booking_component` / `markup_ledger`** — written by the reused
  `bookItinerary` when the traveler self-books the copy. Unchanged; seller-agency-scoped.
- **`agency_vetting` / `organization`** — read for the browse card (badge + name). Unchanged.

## State & lifecycle

- A `marketplace_fork` row is **immutable** once written (append-only, like
  `group_departure_seat` / `revenue_share_ledger`); no application code updates or deletes it
  (FK cascades from a deleted copy/traveler are the only removal).
- The forked **copy itinerary** has the normal itinerary lifecycle; the traveler self-books its
  items (making `booking_component` rows on the copy, not the listing).
- Deactivating the source listing does not affect existing fork copies (they are independent
  itineraries); it only stops new forks (FR-009) and removes the card from browse (FR-001).

## Invariant coverage

| Invariant | How held |
|-----------|----------|
| INV-004 tenant scoping | Copy + all money rows carry `seller_agency_id`; self-book resolves tenant from the copy's share link, never the traveler session. |
| INV-010 money math only in domain | No new math; markup via reused `deriveMarkupBps`/`quoteItinerary`; split math untouched (no resale). |
| INV-011 conservation on failure | Inherited from `bookItinerary` — L3 forced-failure test asserts nothing charged, no orphan rows. |
| INV-020 client-facing only | Browse projection + self-book redaction expose sell-only fields; `marketplace_fork` has no money columns to leak. |
| INV-024 traveler ≠ agency | Fork/self-book are `protectedProcedure`; the traveler never gains `agencyId`; the seller tenant comes from the link. |
| Constitution IV | Copy re-validated by `parseItinerary`; `marketplace_fork` is a bolt-on; `SCHEMA_VERSION` unchanged. |
