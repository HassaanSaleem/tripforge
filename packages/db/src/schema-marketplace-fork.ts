// Traveler marketplace-fork domain module (spec 041: a traveler forks a
// marketplace listing into their own working copy, then self-books or requests
// an agent). Bolt-on metadata over an itinerary — NOT a canonical itinerary
// schema change (Constitution IV) — the same pattern as marketplace_listing
// (schema-marketplace.ts), group_departure (schema-group-travel.ts), and
// traveler_group (schema-group-trips.ts). Additive + backfill-free (db:push,
// no backfill): no canonical SCHEMA_VERSION bump.
//
// MONEY-FREE by design: a fork is NOT a trade — it records provenance only (no
// net / markup / take-rate / sell / revenue-share columns). The forked copy is
// owned by the ORIGINATING (seller) agency (bound a, GOAL.md 2026-07-27); the
// traveler is attached to the copy via client_trip_link (spec 031), never as a
// new itinerary owner. source_itinerary_id is the listed source whose
// established markup the reused self-book path reads live at book time (bound b)
// — the fork stores the POINTER, not a snapshotted price.
import { pgTable, text, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
// See schema.ts for why these sibling imports omit the `.js` extension.
import { agencyRef } from "./schema-columns";
import { user } from "./schema-auth";
import { itineraryFk } from "./schema-itinerary";
import { marketplaceListing } from "./schema-marketplace";

export const marketplaceFork = pgTable(
  "marketplace_fork",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The forked copy itinerary. UNIQUE — at most one fork record per copy; the
    // book-time markup fallback (deriveMarkupBps) looks the source up by this.
    // Cascade: a deleted copy removes its fork record.
    copyItineraryId: itineraryFk("copy_itinerary_id"),
    // Which listing was forked (provenance/audit). No cascade on the listing:
    // deactivating/relisting must not erase existing forks.
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListing.id),
    // The listed SOURCE itinerary — the markup basis (bound b). Stored directly
    // (not only via listing_id) so the fallback is a single indexed hop and
    // survives listing deactivation.
    sourceItineraryId: itineraryFk("source_itinerary_id"),
    // The originating/owning agency of the copy — immutable provenance stamp
    // (agencyRef, no cascade — matches marketplace_license.seller_agency_id).
    sellerAgencyId: agencyRef("seller_agency_id"),
    // The traveler who forked (audit; also the copy's "My Trips" owner via
    // client_trip_link). Cascade: the fork record dies with the user.
    travelerUserId: text("traveler_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    copyItineraryUnique: uniqueIndex("marketplace_fork_copy_itinerary_idx").on(table.copyItineraryId),
    travelerIdx: index("marketplace_fork_traveler_idx").on(table.travelerUserId),
    sourceIdx: index("marketplace_fork_source_idx").on(table.sourceItineraryId),
  }),
);
