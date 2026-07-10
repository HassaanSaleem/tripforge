// Drizzle schema (PostgreSQL — the single system of record, INV-003).
//
// Tables map to Better Auth v1 core (user/session/account/verification) plus the
// organization plugin (organization/member/invitation). An **agency is a Better
// Auth organization**; `organization.id` is the tenant key referenced everywhere
// as `agencyId` (INV-004). Tenant-owned product tables (itineraries, listings,
// ledgers) are added by later seeds and MUST carry `agencyId` referencing
// `organization.id`.
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, uuid, bigint, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Better Auth organization plugin stores the caller's active org here — this is
  // the source of the agencyId in the request session context (INV-023/004).
  activeOrganizationId: text("active_organization_id").references(() => organization.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Organization plugin (agency = organization) ─────────────────────────────

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Agency org role — kept to owner/admin/member at MVP (architecture §1.4).
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

// ─── Shared column builders (product tables) ─────────────────────────────────
//
// The column groups the booking/marketplace tables repeat, named once. NOT
// exported — table constants are this module's only public surface. Deliberate
// variants stay inline at their table: nullable money (pmf_event.amount_minor),
// the vetting PK-as-FK, and no-cascade itinerary/quote references.

/** Integer minor-unit money amount + NOT NULL — the INV-009 shape. */
const moneyMinor = (name: string) => bigint(name, { mode: "number" }).notNull();

/** Tenant key of a tenant-OWNED row — the row dies with its agency (INV-004). */
const agencyFk = (name = "agency_id") =>
  text(name).notNull().references(() => organization.id, { onDelete: "cascade" });

/** Agency party on an IMMUTABLE trade record — NO cascade: deleting an agency
 *  with recorded trades must fail rather than erase ledger history. */
const agencyRef = (name: string) => text(name).notNull().references(() => organization.id);

/** Itinerary FK on rows that die with their itinerary. */
const itineraryFk = (name = "itinerary_id") =>
  uuid(name).notNull().references(() => itinerary.id, { onDelete: "cascade" });

// The supplier-priced side of one bookable component: net price plus the
// explicit conversion applied when the supplier priced in a foreign currency
// (spec 005 FR-008; rate_* nullable = supplier priced in itinerary currency).
const supplierNetColumns = () => ({
  netMinor: moneyMinor("net_minor"),
  netCurrency: text("net_currency").notNull(),
  rateNumerator: bigint("rate_numerator", { mode: "number" }),
  rateDenominator: bigint("rate_denominator", { mode: "number" }),
});

// The agency-priced side of the same component: sell in the itinerary currency
// and who is merchant of record for it (PRD 9.4).
const agencySellColumns = () => ({
  sellMinor: moneyMinor("sell_minor"),
  currency: text("currency").notNull(),
  merchantOfRecord: text("merchant_of_record").notNull(),
});

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

// ─── Build → Book (spec 005: budget allocator + quote-then-book) ─────────────
//
// All five tables are tenant-owned (agency_id → organization.id, INV-004).
// Money columns are integer minor units + explicit currency (INV-009).
// The canonical itinerary document is stored WHOLE as jsonb — the DB never
// forks its shape (INV-001); it is validated by parseItinerary at the api
// boundary on write and read. `trip_request` is adjacent persistence context
// (supply-search re-derivation), not a canonical-schema extension.

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

// A server-held firm price for one itinerary item (spec 005 FR-009). Rows are
// dead at expires_at — never served past it (INV-006; INV-026 carve-out) —
// and consumed by at most one booking. rate_* record the explicit conversion
// applied when the supplier priced in a foreign currency (FR-008).
export const bookingQuote = pgTable(
  "booking_quote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: agencyFk(),
    itineraryId: itineraryFk(),
    itemId: text("item_id").notNull(),
    port: text("port").notNull(),
    offerId: text("offer_id").notNull(),
    supplierQuoteId: text("supplier_quote_id").notNull(),
    ...supplierNetColumns(),
    convertedNetMinor: moneyMinor("converted_net_minor"),
    markupBps: bigint("markup_bps", { mode: "number" }).notNull(),
    ...agencySellColumns(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    agencyItineraryIdx: index("booking_quote_agency_itinerary_idx").on(table.agencyId, table.itineraryId),
  }),
);

// One booking attempt that confirmed at least one component; an attempt where
// every component fails writes NOTHING (FR-011 conservation).
export const booking = pgTable("booking", {
  id: uuid("id").primaryKey().defaultRandom(),
  agencyId: agencyFk(),
  itineraryId: itineraryFk(),
  status: text("status").notNull(), // confirmed | partially_confirmed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// The reservation row per CONFIRMED component (FR-010) — written in the same
// transaction as its booking, ledger row, and PMF event.
export const bookingComponent = pgTable(
  "booking_component",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    agencyId: agencyFk(),
    itineraryId: itineraryFk(),
    itemId: text("item_id").notNull(),
    port: text("port").notNull(),
    offerId: text("offer_id").notNull(),
    // UNIQUE backstop for FR-009 "consumed by at most one booking": the atomic
    // consumed_at flip in the booking service is the guard; this constraint makes
    // a double-record impossible even if a future caller bypasses it.
    quoteRowId: uuid("quote_row_id")
      .notNull()
      .unique()
      .references(() => bookingQuote.id),
    supplierBookingId: text("supplier_booking_id").notNull(),
    ...supplierNetColumns(),
    ...agencySellColumns(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // UNIQUE backstop for FR-016 item-level exclusivity (spec-gap-0002): at
    // most one recorded booking per itinerary item under any interleaving —
    // the claim-time item guard in the booking service is the gate; this
    // index makes a second record impossible even if a caller bypasses it.
    itineraryItemIdx: uniqueIndex("booking_component_itinerary_item_idx").on(table.itineraryId, table.itemId),
  }),
);

// The agency margin record per confirmed component: markup = sell − net
// EXACTLY (Money-Safe ledger identity; the row revenue-share/take-rate
// features build on — Constitution VI).
export const markupLedger = pgTable("markup_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  agencyId: agencyFk(),
  bookingComponentId: uuid("booking_component_id")
    .notNull()
    .references(() => bookingComponent.id, { onDelete: "cascade" }),
  netMinor: moneyMinor("net_minor"),
  sellMinor: moneyMinor("sell_minor"),
  markupMinor: moneyMinor("markup_minor"),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Trade (spec 006: marketplace v0 — list / license / rate) ────────────────
//
// Money columns are integer minor units + explicit currency (INV-009); split
// math is computed only by packages/domain (INV-010) and recorded here inside
// the license transaction (INV-012). Tenancy (INV-004): listings/ledger/ratings
// are owned by one agency; marketplace_license is deliberately TWO-SIDED
// (seller + reseller read their own trades); browse is the one documented
// cross-tenant read (spec 006 research D7 — active listings, public fields).

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

export const schema = {
  user,
  session,
  account,
  verification,
  organization,
  member,
  invitation,
  pmfEvent,
  itinerary,
  bookingQuote,
  booking,
  bookingComponent,
  markupLedger,
  agencyVetting,
  marketplaceListing,
  marketplaceLicense,
  revenueShareLedger,
  listingRating,
  itineraryShareLink,
};

export type Schema = typeof schema;
