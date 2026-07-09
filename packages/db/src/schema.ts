// Drizzle schema (PostgreSQL — the single system of record, INV-003).
//
// Tables map to Better Auth v1 core (user/session/account/verification) plus the
// organization plugin (organization/member/invitation). An **agency is a Better
// Auth organization**; `organization.id` is the tenant key referenced everywhere
// as `agencyId` (INV-004). Tenant-owned product tables (itineraries, listings,
// ledgers) are added by later seeds and MUST carry `agencyId` referencing
// `organization.id`.
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
    agencyId: text("agency_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    itineraryId: text("itinerary_id"),
    source: text("source"),
    amountMinor: bigint("amount_minor", { mode: "number" }),
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
    agencyId: text("agency_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
    agencyId: text("agency_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    itineraryId: uuid("itinerary_id")
      .notNull()
      .references(() => itinerary.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    port: text("port").notNull(),
    offerId: text("offer_id").notNull(),
    supplierQuoteId: text("supplier_quote_id").notNull(),
    netMinor: bigint("net_minor", { mode: "number" }).notNull(),
    netCurrency: text("net_currency").notNull(),
    rateNumerator: bigint("rate_numerator", { mode: "number" }),
    rateDenominator: bigint("rate_denominator", { mode: "number" }),
    convertedNetMinor: bigint("converted_net_minor", { mode: "number" }).notNull(),
    markupBps: bigint("markup_bps", { mode: "number" }).notNull(),
    sellMinor: bigint("sell_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    merchantOfRecord: text("merchant_of_record").notNull(),
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
  agencyId: text("agency_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  itineraryId: uuid("itinerary_id")
    .notNull()
    .references(() => itinerary.id, { onDelete: "cascade" }),
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
    agencyId: text("agency_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    itineraryId: uuid("itinerary_id")
      .notNull()
      .references(() => itinerary.id, { onDelete: "cascade" }),
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
    netMinor: bigint("net_minor", { mode: "number" }).notNull(),
    netCurrency: text("net_currency").notNull(),
    rateNumerator: bigint("rate_numerator", { mode: "number" }),
    rateDenominator: bigint("rate_denominator", { mode: "number" }),
    sellMinor: bigint("sell_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    merchantOfRecord: text("merchant_of_record").notNull(),
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
  agencyId: text("agency_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  bookingComponentId: uuid("booking_component_id")
    .notNull()
    .references(() => bookingComponent.id, { onDelete: "cascade" }),
  netMinor: bigint("net_minor", { mode: "number" }).notNull(),
  sellMinor: bigint("sell_minor", { mode: "number" }).notNull(),
  markupMinor: bigint("markup_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
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
};

export type Schema = typeof schema;
