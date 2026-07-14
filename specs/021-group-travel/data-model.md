# Data Model: Group travel

All tables live in `packages/db/src/schema-group-travel.ts` (new file, Drizzle, applied via
`drizzle-kit push`), assembled into `packages/db/src/schema.ts` alongside
`schema-marketplace.ts`. Conventions inherited from spec 006/005: uuid PKs
(`defaultRandom`), money as `bigint` integer minor units + explicit `currency` text
(INV-009) via the shared `moneyMinor()` helper, tenant `agency_id → organization.id` via
`agencyFk()`/`agencyRef()` (INV-004), timestamps `defaultNow`.

## group_departure (FR-001/002/003/004/010, research D1/D4)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK defaultRandom | |
| agency_id | text NOT NULL → organization.id (cascade, `agencyFk`) | posting/owning agency (INV-004) |
| itinerary_id | uuid NOT NULL → itinerary.id (`itineraryFk`, no cascade — same convention as `marketplace_listing.itinerary_id`) | the underlying trip content |
| departure_date | timestamp NOT NULL | |
| capacity | bigint NOT NULL, > 0 (app-validated) | total seats at post time; immutable after posting (v0 — no in-place edit) |
| seats_remaining | bigint NOT NULL | mutated ONLY via the atomic conditional UPDATE in `joinGroupDeparture`; starts equal to `capacity` |
| price_per_seat_minor | bigint NOT NULL (`moneyMinor`) | integer minor units, >= 0 (app-validated) |
| currency | text NOT NULL | = the itinerary's single currency |
| status | text NOT NULL | `active` \| `cancelled` |
| created_at | timestamp NOT NULL defaultNow | |
| cancelled_at | timestamp NULL | set when status → cancelled |

Indexes: `index(agency_id)` for management reads; `index(itinerary_id)` (an itinerary MAY
have more than one departure — e.g. recurring monthly group tours — unlike
`marketplace_listing`'s one-active-per-itinerary rule, so no uniqueness constraint here);
`index(status)` for the browse scan.

State transitions: `active → cancelled` (posting agency's cancellation; one-way at v0,
mirrors `marketplace_listing`'s deactivate pattern — re-post to change terms).

## group_departure_seat (FR-005/006/007, research D1)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK defaultRandom | |
| group_departure_id | uuid NOT NULL → group_departure.id (no cascade — immutable sale record, `marketplace_license` precedent) | |
| joined_by_agency_id | text NOT NULL → organization.id (no cascade, `agencyRef`) | the acting agent's agency (B2B2C intermediary) |
| traveler_name | text NOT NULL | named client the agent is joining on behalf of |
| traveler_email | text NULL | optional contact |
| seat_price_minor | bigint NOT NULL (`moneyMinor`) | snapshot of the departure's per-seat price at join time |
| currency | text NOT NULL | |
| joined_at | timestamp NOT NULL defaultNow | |

Indexes: `index(group_departure_id)` (capacity-count/management reads); `index(joined_by_agency_id)`
("my joins" reads).

Immutability: never updated or deleted by application code (matches `revenue_share_ledger`/
`marketplace_license` precedent — a seat, once joined, is a permanent sale record; v0 has no
cancellation/refund flow for individual seats, per spec Edge Cases).

Capacity invariant (enforced at the application layer via the atomic conditional UPDATE, not
a DB CHECK constraint — matches the existing convention of app-validated bounds like
`revenue_share_bps`, not DB-level CHECK): at most `capacity` seat rows may ever exist per
`group_departure_id`; `group_departure.seats_remaining` is always `capacity` minus the count
of that departure's seat rows.

## Existing tables touched

- **`marketplace_listing`/`marketplace_license`/`revenue_share_ledger`**: NO shape change.
  A group departure's underlying itinerary is listed/licensed through these UNCHANGED tables
  exactly as any other itinerary (FR-009) — `group_departure` is a parallel bolt-on, not a
  modification.
- **`licenseListing` transaction** (`packages/marketplace/src/licensing.ts`): gains one
  additive step — after the white-label itinerary copy is inserted, look up whether the
  SOURCE itinerary (`listing.itineraryId`) has an `active` `group_departure` row; if so,
  insert a new `group_departure` row for the copy (`itinerary_id = copyId`, `agency_id =
  actor.agencyId`, same `departure_date`/`price_per_seat_minor`/`currency`, `capacity` = the
  ORIGINAL's `capacity` (not its current `seats_remaining`), `seats_remaining = capacity`,
  `status = 'active'`). If no group-departure row exists for the source, this step is a no-op
  — zero behavior change for ordinary (non-group) listings (existing spec 006 tests stay
  green).
- **`pmf_event`**: additive event types only (see Phase 0 research D6 / plan.md): no shape
  change to the `pmf_event` table itself — `group_departure_posted` reuses the existing
  no-money shape (`agencyId`, `itineraryId`, `actorUserId`), `group_departure_seat_joined`
  reuses the existing money-bearing shape (`agencyId` = departure owner, `itineraryId`,
  `amountMinor` = seat price, `currency`, `actorUserId`).

## Canonical itinerary schema

**NO change** — group departures are bolt-on metadata in their own table, exactly like
`marketplace_listing`. No `SCHEMA_VERSION` bump, hence no operator schema gate.
