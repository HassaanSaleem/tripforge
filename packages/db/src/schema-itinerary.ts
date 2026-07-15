// Itinerary domain module (schema.ts assembles this with auth/agency,
// booking, and marketplace+pmf; quality-sweep split, QS3-10). The canonical
// itinerary document table, its FK helper (consumed by both the booking and
// marketplace domain modules), the client-view share link, and content
// library media-asset metadata — all itinerary-adjacent persistence.
import { pgTable, text, timestamp, uuid, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
// See schema.ts for why this sibling import omits the `.js` extension.
import { agencyFk } from "./schema-columns";
import { user } from "./schema-auth";

// ─── Build → Book (spec 005: budget allocator + quote-then-book) ─────────────
//
// Tenant-owned (agency_id → organization.id, INV-004). The canonical
// itinerary document is stored WHOLE as jsonb — the DB never forks its shape
// (INV-001); it is validated by parseItinerary at the api boundary on write
// and read. `trip_request` is adjacent persistence context (supply-search
// re-derivation), not a canonical-schema extension.
//
// `creation_source` (spec 029, bring-your-own itinerary): records HOW the row
// was created — 'ai_drafted' | 'manual' | 'licensed_copy' — for display only
// (workspace/marketplace origin badges). Deliberately NOT the same signal as
// the `pmf_event.trip_created.source` enum ('self_built' | 'licensed'), which
// is a separate, closed, load-bearing field feeding the constitution-mandated
// resold:self-built PMF ratio (packages/db/sql/pmf-views.sql) — both
// AI-drafted and manual itineraries record 'self_built' there, unchanged.
// Plain `text` (not a DB enum), matching `media_asset.source`'s convention;
// validated at the Zod boundary in the service layer. `DEFAULT 'ai_drafted'`
// makes this an additive, backfill-free migration: every pre-existing row was
// in fact AI-drafted or a licensed copy, and pre-existing licensed-copy rows
// keep rendering correctly through the unrelated `provenance.rebrandLineage`
// derivation regardless of this column's defaulted value (data-model.md).
export const itinerary = pgTable(
  "itinerary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyFk(),
    title: text("title").notNull(),
    currency: text("currency").notNull(),
    document: jsonb("document").notNull(),
    tripRequest: jsonb("trip_request").notNull(),
    creationSource: text("creation_source").notNull().default("ai_drafted"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    agencyIdx: index("itinerary_agency_idx").on(table.agencyId),
  }),
);

/** Itinerary FK on rows that die with their itinerary. */
export const itineraryFk = (name = "itinerary_id") =>
  uuid(name).notNull().references(() => itinerary.id, { onDelete: "cascade" });

// ─── Share (spec 010: client-view share link) ────────────────────────────────

// One durable, unguessable client-view link per itinerary (spec 010 FR-003/004).
// The uuid PK IS the share token (gen_random_uuid, 122 random bits — research
// D1); UNIQUE(itinerary_id) is the one-link arbiter, deciding concurrent share
// races in the DB (marketplace duplicate-license-gate precedent). Tenant-owned
// (INV-004); cascades make links of deleted itineraries behave as unknown
// tokens. NOT a canonical itinerary schema change — the jsonb document shape is
// untouched. Create-only at v0 (revocation/expiry deferred, spec Assumptions).
export const itineraryShareLink = pgTable("itinerary_share_link", {
  token: uuid("token").primaryKey().defaultRandom(),
  agencyId: agencyFk(),
  itineraryId: itineraryFk().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Content library (spec 015: content library v0; spec 027: real upload) ──
//
// Agency-owned media asset metadata. v0 was URL-registration only (research
// D2). spec 027 (seed-0022a) adds a second, upload-backed row shape: bytes
// live in `dataBase64`/`mimeType` (both NULL for a URL-registered row, both
// populated for an uploaded one); `url` is NULL for an uploaded row — the
// adapter derives its servable path (`/api/media/{id}`) at read time rather
// than storing it literally (data-model.md). Postgres stays the single
// system of record (INV-003) — no second datastore. Referenced by `id` from
// `MediaRef`s inside itinerary documents (a plain string reference, not an
// FK — the document is jsonb, same pattern as `supplyRef.externalId`).
// `source` mirrors @tripforge/itinerary-schema's closed MediaSource enum,
// enforced at the tRPC boundary (Zod) and defense-in-depth in the adapter.
export const mediaAsset = pgTable(
  "media_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyFk(),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
    url: text("url"),
    alt: text("alt").notNull(),
    attribution: text("attribution"),
    dataBase64: text("data_base64"),
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    agencyIdx: index("media_asset_agency_idx").on(table.agencyId),
  }),
);

// ─── Traveler trip history (spec 031: "My Trips") ────────────────────────────
//
// Bolt-on metadata about an itinerary — NOT a canonical schema change
// (Constitution IV) — the same pattern as itinerary_share_link/
// trip_handoff_request/group_departure. Records that a signed-in visitor
// (traveler OR agent, spec 030 precedent) has opened a trip's share link at
// least once (research D1: "attach on view" is the sole v0 trigger).
// UNIQUE(user_id, itinerary_id) is both the idempotency arbiter for repeat
// views (INSERT ... ON CONFLICT DO NOTHING, same pattern as
// itinerary_share_link's UNIQUE(itinerary_id)) and the sole predicate that
// keeps one visitor's list from ever containing another's trips.
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
    // The `myTrips` query is always `WHERE user_id = ? ORDER BY created_at DESC`.
    userCreatedIdx: index("client_trip_link_user_created_idx").on(table.userId, table.createdAt),
  }),
);
