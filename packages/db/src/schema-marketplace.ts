// Marketplace+PMF domain module (schema.ts assembles this with auth/agency,
// itinerary, and booking; quality-sweep split, QS3-10) — grouped together
// because PMF events are written inside the same transactions as marketplace
// trades (INV-021) and both are cross-cutting layers over itinerary + agency.
//
// Trade (spec 006: marketplace v0 — list / license / rate). Money columns are
// integer minor units + explicit currency (INV-009); split math is computed
// only by packages/domain (INV-010) and recorded here inside the license
// transaction (INV-012). Tenancy (INV-004): listings/ledger/ratings are owned
// by one agency; marketplace_license is deliberately TWO-SIDED (seller +
// reseller read their own trades); browse is the one documented cross-tenant
// read (spec 006 research D7 — active listings, public fields).
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
// See schema.ts for why these sibling imports omit the `.js` extension.
import { agencyFk, agencyRef, moneyMinor } from "./schema-columns";
import { organization, user } from "./schema-auth";
import { itinerary, itineraryFk } from "./schema-itinerary";

// ─── PMF instrumentation (INV-021, Constitution MVP Scope Discipline) ─────────

// Append-only PMF metric event store. Events are written in the SAME transaction
// as the business action they measure (INV-021) via recordPmfEvent — never
// updated or deleted by application code. Money columns are integer minor units
// + explicit currency (INV-009); the closed type vocabulary and per-type field
// rules live in pmf-events.ts (TS-validated — the itineraries table does not
// exist yet, so itinerary_id is an opaque reference, not an FK).
export const pmfEvent = pgTable(
  "pmf_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    agencyId: agencyFk(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    itineraryId: text("itinerary_id"),
    source: text("source"),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    // Full license split (spec 006 FR-014) — populated only on take_rate_accrued
    // events accrued via a marketplace license; conservation is validated at
    // write time: price_minor = amount_minor + seller_credit_minor EXACTLY.
    priceMinor: bigint("price_minor", { mode: "number" }),
    sellerCreditMinor: bigint("seller_credit_minor", { mode: "number" }),
    currency: text("currency"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    typeAgencyIdx: index("pmf_event_type_agency_idx").on(table.type, table.agencyId),
  }),
);

// The who-may-list gate (spec 006 FR-001, D-0006.a): an agency is vetted for
// marketplace supply/demand iff its row exists. Written ONLY by the platform
// operator action (packages/db/scripts/vet-agency.mjs) — no product code path
// inserts here; signing up never implies vetting (Constitution VI).
export const agencyVetting = pgTable("agency_vetting", {
  agencyId: text("agency_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  vettedAt: timestamp("vetted_at").notNull().defaultNow(),
  vettedBy: text("vetted_by").notNull(),
});

export const marketplaceListing = pgTable(
  "marketplace_listing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerAgencyId: agencyFk("seller_agency_id"),
    itineraryId: itineraryFk(),
    title: text("title").notNull(),
    priceMinor: moneyMinor("price_minor"),
    currency: text("currency").notNull(),
    licenseTerms: text("license_terms").notNull(),
    revenueShareBps: bigint("revenue_share_bps", { mode: "number" }).notNull(),
    status: text("status").notNull(), // active | inactive
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deactivatedAt: timestamp("deactivated_at"),
  },
  (table) => ({
    // At most one ACTIVE listing per itinerary (spec 006 D9): partial unique
    // index decides creation races even for callers that bypass the service.
    activeItineraryIdx: uniqueIndex("marketplace_listing_active_itinerary_idx")
      .on(table.itineraryId)
      .where(sql`status = 'active'`),
    sellerIdx: index("marketplace_listing_seller_idx").on(table.sellerAgencyId),
  }),
);

// The completed trade. UNIQUE (listing_id, reseller_agency_id) is the
// duplicate-license gate (FR-012) — concurrent duplicates race on the insert
// and exactly one wins; the loser's transaction rolls back whole (INV-011).
export const marketplaceLicense = pgTable(
  "marketplace_license",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListing.id),
    sellerAgencyId: agencyRef("seller_agency_id"),
    resellerAgencyId: agencyRef("reseller_agency_id"),
    copyItineraryId: uuid("copy_itinerary_id")
      .notNull()
      .references(() => itinerary.id),
    priceMinor: moneyMinor("price_minor"),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    listingResellerIdx: uniqueIndex("marketplace_license_listing_reseller_idx").on(
      table.listingId,
      table.resellerAgencyId,
    ),
    resellerIdx: index("marketplace_license_reseller_idx").on(table.resellerAgencyId),
  }),
);

// The revenue-share split per license — exactly one row, written in the SAME
// transaction as the license (INV-012). Row-local conservation identity:
// price = platform_take + seller_credit EXACTLY (markup_ledger precedent).
// Immutable — never updated or deleted by application code.
export const revenueShareLedger = pgTable("revenue_share_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  licenseId: uuid("license_id")
    .notNull()
    .unique()
    .references(() => marketplaceLicense.id, { onDelete: "cascade" }),
  sellerAgencyId: agencyRef("seller_agency_id"),
  resellerAgencyId: agencyRef("reseller_agency_id"),
  priceMinor: moneyMinor("price_minor"),
  platformTakeMinor: moneyMinor("platform_take_minor"),
  sellerCreditMinor: moneyMinor("seller_credit_minor"),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Licensee-only ratings (FR-013): one per (listing, rater agency) — re-rating
// upserts on this key so the count never inflates.
export const listingRating = pgTable(
  "listing_rating",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListing.id, { onDelete: "cascade" }),
    raterAgencyId: agencyFk("rater_agency_id"),
    stars: bigint("stars", { mode: "number" }).notNull(), // 1..5, app-validated
    comment: text("comment"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    listingRaterIdx: uniqueIndex("listing_rating_listing_rater_idx").on(table.listingId, table.raterAgencyId),
  }),
);
