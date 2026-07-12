// Shared column builders for tenant-owned product tables (schema.ts assembles
// the domain modules these support — auth/agency, itinerary, booking,
// marketplace+pmf; quality-sweep split, QS3-10). NOT exported from the
// package's public surface — table constants are the domain modules' only
// public surface. Deliberate variants stay inline at their table: nullable
// money (pmf_event.amount_minor), the vetting PK-as-FK, and no-cascade
// itinerary/quote references.
import { bigint, text } from "drizzle-orm/pg-core";
// See schema.ts for why this sibling import omits the `.js` extension.
import { organization } from "./schema-auth";

/** Integer minor-unit money amount + NOT NULL — the INV-009 shape. */
export const moneyMinor = (name: string) => bigint(name, { mode: "number" }).notNull();

/** Tenant key of a tenant-OWNED row — the row dies with its agency (INV-004). */
export const agencyFk = (name = "agency_id") =>
  text(name).notNull().references(() => organization.id, { onDelete: "cascade" });

/** Agency party on an IMMUTABLE trade record — NO cascade: deleting an agency
 *  with recorded trades must fail rather than erase ledger history. */
export const agencyRef = (name: string) => text(name).notNull().references(() => organization.id);

// The supplier-priced side of one bookable component: net price plus the
// explicit conversion applied when the supplier priced in a foreign currency
// (spec 005 FR-008; rate_* nullable = supplier priced in itinerary currency).
export const supplierNetColumns = () => ({
  netMinor: moneyMinor("net_minor"),
  netCurrency: text("net_currency").notNull(),
  rateNumerator: bigint("rate_numerator", { mode: "number" }),
  rateDenominator: bigint("rate_denominator", { mode: "number" }),
});

// The agency-priced side of the same component: sell in the itinerary currency
// and who is merchant of record for it (PRD 9.4).
export const agencySellColumns = () => ({
  sellMinor: moneyMinor("sell_minor"),
  currency: text("currency").notNull(),
  merchantOfRecord: text("merchant_of_record").notNull(),
});
