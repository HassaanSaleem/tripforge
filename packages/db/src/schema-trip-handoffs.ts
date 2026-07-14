// Trip handoff request domain module (spec 022: self-drive vs. request-an-
// agent fork on the client trip view). Bolt-on side record about an
// itinerary — NOT a canonical schema change (Constitution IV) — the same
// pattern as itinerary_share_link/group_departure. Named `TripHandoffRequest`
// (not `TripRequest`) to avoid colliding with the pre-existing, unrelated
// `itinerary.trip_request` planner-criteria column (research D5). Not a
// money path — no revenue-share/markup columns.
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
// See schema.ts for why this sibling import omits the `.js` extension.
import { agencyFk } from "./schema-columns";
import { itineraryFk } from "./schema-itinerary";

// A traveler's ask that an agent take over arranging their trip (spec 022
// FR-001-FR-011, research D3/D4). agencyId is the itinerary's CURRENT owning
// agency at submission time (never the original author) — resolved once at
// insert, not re-derived later, so a subsequent re-license of the itinerary
// does not retroactively move an already-submitted request.
export const tripHandoffRequest = pgTable(
  "trip_handoff_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itineraryId: itineraryFk(),
    agencyId: agencyFk(),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email"),
    notes: text("notes"),
    status: text("status").notNull(), // new | accepted
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // The inbox query is always `WHERE agency_id = ? ORDER BY created_at DESC`.
    agencyCreatedIdx: index("trip_handoff_request_agency_created_idx").on(
      table.agencyId,
      table.createdAt,
    ),
  }),
);
