// Booking domain module (schema.ts assembles this with auth/agency,
// itinerary, and marketplace+pmf; quality-sweep split, QS3-10).
//
// Build → Book (spec 005: budget allocator + quote-then-book flow). All four
// tables are tenant-owned (agency_id → organization.id, INV-004). Money
// columns are integer minor units + explicit currency (INV-009).
import { pgTable, text, timestamp, uuid, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
// See schema.ts for why these sibling imports omit the `.js` extension.
import { agencyFk, agencySellColumns, moneyMinor, supplierNetColumns } from "./schema-columns";
import { itineraryFk } from "./schema-itinerary";

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
