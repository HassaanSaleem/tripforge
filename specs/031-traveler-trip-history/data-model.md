# Data Model: Traveler Trip History — "My Trips"

**One new table, additive + backfill-free, no canonical itinerary schema change.** This file
documents the new table's shape and confirms every existing table/column it touches (read-only) vs.
leaves untouched.

## New table: `client_trip_link`

```ts
export const clientTripLink = pgTable(
  "client_trip_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itineraryId: itineraryFk(),
    source: text("source").notNull(), // "view" — the sole v0 trigger (research D1)
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userItineraryUnique: uniqueIndex("client_trip_link_user_itinerary_idx").on(
      table.userId,
      table.itineraryId,
    ),
    userCreatedIdx: index("client_trip_link_user_created_idx").on(table.userId, table.createdAt),
  }),
);
```

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | Standard row identity, unused by any query (the unique pair is the real key) |
| `user_id` | text, FK → `user.id`, cascade | The signed-in visitor (traveler OR agent, spec 030 precedent); cascades so a deleted account leaves no orphan history |
| `itinerary_id` | uuid, FK → `itinerary.id`, cascade | Via `itineraryFk()` — the exact same helper `itineraryShareLink`/`tripHandoffRequest`/`groupDeparture` already use; cascades so a deleted itinerary silently drops out of every visitor's history (consistent with "unknown token" semantics) |
| `source` | text, not null | Always `"view"` at v0 (research D1); plain text (not a DB enum), matching `media_asset.source`'s and `itinerary.creation_source`'s convention — future sources (e.g. a future traveler-authenticated group-seat join) can be added without a migration |
| `created_at` | timestamp, not null, default now() | First-linked time; ordering key for the "My Trips" list (spec.md does not require last-viewed recency — see Assumptions) |

**Indexes**: `UNIQUE(user_id, itinerary_id)` is the idempotency arbiter for attach-on-view (repeat
visits `onConflictDoNothing`, same pattern as `itineraryShareLink`'s `UNIQUE(itinerary_id)`
converging concurrent share-link creation). `(user_id, created_at)` supports the `myTrips` query's
`WHERE user_id = ? ORDER BY created_at DESC` access pattern, mirroring
`trip_handoff_request_agency_created_idx`'s precedent.

## Existing tables touched

- **`user`** (`packages/db/src/schema-auth.ts:10-18`): **read-only** via the new FK reference.
  No new column.
- **`itinerary`** (`packages/db/src/schema-itinerary.ts:31-47`): **read-only** via the new FK
  reference. No new column.
- **`itinerary_share_link`** (`packages/db/src/schema-itinerary.ts:62-67`): **untouched, read
  more**. `listTravelerTrips` joins on `itinerary_id` to recover each linked trip's token (the
  `UNIQUE(itinerary_id)` constraint guarantees at most one token per itinerary, so this join is
  never ambiguous). No schema change.
- **`booking_component`**: **untouched**, read only inside the pre-existing `resolveShareLink`
  call `listTravelerTrips` reuses per trip — zero new query shape.

## Canonical itinerary schema

**NO change** — this feature never touches the `Itinerary` document, its `SCHEMA_VERSION`, or any
canonical-schema package export. `client_trip_link` is bolt-on metadata about an itinerary, the
same non-canonical-schema pattern already established by `itinerary_share_link` (spec 010),
`trip_handoff_request` (spec 022), and `group_departure`/`group_departure_seat` (spec 021).

## Why this satisfies the ticket's HALT/migration-note requirement

The ticket (and DIRECTIVE §2) require an explicit, versioned migration note whenever a plan touches
schema. The note here is explicit: **exactly one new table, zero new columns on any existing
table, zero enum values changed anywhere.** The migration is additive and backfill-free by
construction — a brand-new table starts empty, and "empty" is the CORRECT starting state (no
visitor has trip history until they view a trip while signed in after this feature ships). No
existing row anywhere needs to change for this migration to be correct. As with SCHEMA-GATE-78 and
spec 030's plan, the specific shape above is operator-ratified at PR merge, not landed silently.

## Response shape: `TravelerTripSummary` (not a table)

Defined in `packages/api/src/services/client-view.ts`, exported from `packages/api/src/index.ts`
(TS4023 convention, mirrors `TravelerIdentity`/`ClientItineraryView`):

| Field | Type | Source |
|---|---|---|
| `token` | string | `itinerary_share_link.token`, joined by `itineraryId` |
| `title` | string | `resolveShareLink(...).view.title` (unmodified) |
| `agencyName` | string | `resolveShareLink(...).view.agencyName` (unmodified) |
| `currency` | string | `resolveShareLink(...).view.currency` (unmodified) |
| `totalSellMinor` | number \| null | `resolveShareLink(...).view.totalSellMinor` (unmodified) |
| `linkedAt` | string (ISO) | `client_trip_link.created_at` |

Produced by `listTravelerTrips(container, userId)`, which reads ONLY `client_trip_link` rows where
`user_id = userId` — a value the `protectedProcedure` middleware derives server-side from the
verified session, never from client input (matching spec 030's `getSignedInIdentity` precedent). A
linked itinerary whose share link/itinerary has since been deleted (cascade already removed the
`client_trip_link` row too — see cascade note above) simply cannot appear; no extra filtering is
needed for that case.
