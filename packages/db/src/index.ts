// Public surface of @tripforge/db — Drizzle schema + client + tenant helpers.
export { createDb } from "./client.js";
export type { Db, DbHandle } from "./client.js";
export {
  schema,
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
  groupDeparture,
  groupDepartureSeat,
  tripHandoffRequest,
  consumerPlanRequest,
  clientTripLink,
} from "./schema.js";
export type { Schema } from "./schema.js";
export { tenantScope, scopedWhere } from "./tenant.js";
// Query operators consumers compose scoped conditions with (the ORM itself
// stays this package's dependency — INV-017: no deep drizzle imports outside db).
export { and, asc, avg, count, desc, eq, gt, inArray, isNull, or, sql, sum } from "drizzle-orm";
export {
  getMemberRole,
  getPrimaryMembership,
  getOrganizationName,
  getUserIdentity,
} from "./membership.js";
export {
  PMF_TRIP_SOURCES,
  PmfEventValidationError,
  validatePmfEvent,
  recordPmfEvent,
} from "./pmf-events.js";
export type {
  PmfEvent,
  PmfEventExecutor,
  PmfEventValidationReason,
  PmfTripSource,
} from "./pmf-events.js";
