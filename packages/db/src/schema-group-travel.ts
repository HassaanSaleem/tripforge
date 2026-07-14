// Group travel domain module (spec 021: agent-posted group departures with
// seat capacity, joins, and B2B2B white-label resale). Bolt-on metadata over
// an itinerary — NOT a canonical schema change (Constitution IV) — the same
// pattern as marketplace_listing (schema-marketplace.ts). Money columns are
// integer minor units + explicit currency (INV-009); tenancy (INV-004):
// group_departure is owned by one agency; group_departure_seat is an
// immutable sale record referencing both the departure and the joining
// agency (agencyRef, no cascade — matches marketplace_license precedent).
import { pgTable, text, timestamp, uuid, bigint, index } from "drizzle-orm/pg-core";
// See schema.ts for why these sibling imports omit the `.js` extension.
import { agencyFk, agencyRef, moneyMinor } from "./schema-columns";
import { itineraryFk } from "./schema-itinerary";

// Agency-posted group departure (spec 021 FR-001/002/003/004, research D1/D4).
// seats_remaining is mutated ONLY via the atomic conditional UPDATE in
// joinGroupDeparture (packages/marketplace/src/group-departures.ts) — never
// a bare SET outside that WHERE-guarded claim gate.
export const groupDeparture = pgTable(
  "group_departure",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyFk(),
    itineraryId: itineraryFk(),
    departureDate: timestamp("departure_date").notNull(),
    capacity: bigint("capacity", { mode: "number" }).notNull(), // > 0, app-validated
    seatsRemaining: bigint("seats_remaining", { mode: "number" }).notNull(),
    pricePerSeatMinor: moneyMinor("price_per_seat_minor"),
    currency: text("currency").notNull(),
    status: text("status").notNull(), // active | cancelled
    createdAt: timestamp("created_at").notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at"),
  },
  (table) => ({
    agencyIdx: index("group_departure_agency_idx").on(table.agencyId),
    // No uniqueness on itineraryId: unlike marketplace_listing, one itinerary
    // may have multiple departures (e.g. recurring monthly group tours).
    itineraryIdx: index("group_departure_itinerary_idx").on(table.itineraryId),
    statusIdx: index("group_departure_status_idx").on(table.status),
  }),
);

// One claimed seat (spec 021 FR-005/006/007, research D1). Immutable — never
// updated or deleted by application code (revenue_share_ledger/
// marketplace_license precedent); v0 has no per-seat cancellation/refund.
// At most `capacity` rows may ever exist per group_departure_id — enforced
// by the atomic conditional UPDATE on the parent row's seats_remaining, not
// a DB CHECK (app-validated bounds, matching revenue_share_bps convention).
export const groupDepartureSeat = pgTable(
  "group_departure_seat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupDepartureId: uuid("group_departure_id")
      .notNull()
      .references(() => groupDeparture.id),
    joinedByAgencyId: agencyRef("joined_by_agency_id"),
    travelerName: text("traveler_name").notNull(),
    travelerEmail: text("traveler_email"),
    seatPriceMinor: moneyMinor("seat_price_minor"), // snapshot at join time
    currency: text("currency").notNull(),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (table) => ({
    departureIdx: index("group_departure_seat_departure_idx").on(table.groupDepartureId),
    joinedByIdx: index("group_departure_seat_joined_by_idx").on(table.joinedByAgencyId),
  }),
);
