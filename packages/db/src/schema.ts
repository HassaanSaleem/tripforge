// Drizzle schema (PostgreSQL — the single system of record, INV-003).
//
// Assembled from domain modules — auth/agency (schema-auth.ts), itinerary
// (schema-itinerary.ts), booking (schema-booking.ts), and marketplace+pmf
// (schema-marketplace.ts), plus shared column builders (schema-columns.ts) —
// so drizzle-kit (pointed at this file by drizzle.config.ts) still sees the
// identical flat set of table exports it always has; generated SQL is
// unchanged (quality-sweep split, QS3-10, DB-internal only — NOT a canonical
// itinerary schema change).
// NOTE: these sibling imports deliberately omit the `.js` extension (unlike
// the rest of the codebase's NodeNext-style relative imports) — drizzle-kit's
// CLI schema loader cannot resolve a `.js`-suffixed specifier against an
// on-disk `.ts` file for the file its config points at (verified: fails with
// MODULE_NOT_FOUND); `moduleResolution: "Bundler"` (tsconfig.base.json) and
// every real runtime consumer (Next.js, Vite/vitest) resolve extension-less
// relative imports fine, so this is safe for this module cluster only.
export { user, session, account, verification, organization, member, invitation } from "./schema-auth";
export { itinerary, itineraryFk, itineraryShareLink, mediaAsset } from "./schema-itinerary";
export { bookingQuote, booking, bookingComponent, markupLedger } from "./schema-booking";
export {
  pmfEvent,
  agencyVetting,
  marketplaceListing,
  marketplaceLicense,
  revenueShareLedger,
  listingRating,
} from "./schema-marketplace";

import { user, session, account, verification, organization, member, invitation } from "./schema-auth";
import { itinerary, itineraryShareLink, mediaAsset } from "./schema-itinerary";
import { bookingQuote, booking, bookingComponent, markupLedger } from "./schema-booking";
import {
  pmfEvent,
  agencyVetting,
  marketplaceListing,
  marketplaceLicense,
  revenueShareLedger,
  listingRating,
} from "./schema-marketplace";

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
  mediaAsset,
};

export type Schema = typeof schema;
