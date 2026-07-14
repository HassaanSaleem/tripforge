// Itinerary domain module (schema.ts assembles this with auth/agency,
// booking, and marketplace+pmf; quality-sweep split, QS3-10). The canonical
// itinerary document table, its FK helper (consumed by both the booking and
// marketplace domain modules), the client-view share link, and content
// library media-asset metadata — all itinerary-adjacent persistence.
import { pgTable, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";
// See schema.ts for why this sibling import omits the `.js` extension.
import { agencyFk } from "./schema-columns";

// ─── Build → Book (spec 005: budget allocator + quote-then-book) ─────────────
//
// Tenant-owned (agency_id → organization.id, INV-004). The canonical
// itinerary document is stored WHOLE as jsonb — the DB never forks its shape
// (INV-001); it is validated by parseItinerary at the api boundary on write
// and read. `trip_request` is adjacent persistence context (supply-search
// re-derivation), not a canonical-schema extension.
export const itinerary = pgTable(
  "itinerary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyFk(),
    title: text("title").notNull(),
    currency: text("currency").notNull(),
    document: jsonb("document").notNull(),
    tripRequest: jsonb("trip_request").notNull(),
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
