// Public surface of @tripforge/marketplace — the P0 trade layer (spec 006,
// Constitution I/VI). Flows take (db, actor, input) and return typed outcomes;
// no supplier port is imported anywhere in this package (Constitution V holds
// trivially), and no in-process state exists (INV-028-safe by construction).
export { DEFAULT_PLATFORM_TAKE_RATE_BPS } from "./config.js";
export { isVetted, vettedAgencyIds } from "./vetting.js";
export { whiteLabelCopy } from "./white-label.js";
export type { WhiteLabelOptions } from "./white-label.js";
export { travelerForkCopy } from "./traveler-fork.js";
export type { TravelerForkOptions } from "./traveler-fork.js";
export {
  createListing,
  createListingInputSchema,
  browseListings,
  deactivateListing,
  deactivateListingInputSchema,
} from "./listings.js";
export type {
  CreateListingInput,
  CreateListingOutcome,
  BrowseListing,
  DeactivateListingInput,
  DeactivateListingOutcome,
} from "./listings.js";
export { licenseListing, licenseListingInputSchema } from "./licensing.js";
export type { LicenseListingInput, LicenseListingOutcome } from "./licensing.js";
export { rateListing, rateListingInputSchema } from "./ratings.js";
export type { RateListingInput, RateListingOutcome } from "./ratings.js";
export {
  postGroupDeparture,
  postGroupDepartureInputSchema,
  cancelGroupDeparture,
  cancelGroupDepartureInputSchema,
  browseGroupDepartures,
  joinGroupDeparture,
  joinGroupDepartureInputSchema,
} from "./group-departures.js";
export type {
  PostGroupDepartureInput,
  PostGroupDepartureOutcome,
  CancelGroupDepartureInput,
  CancelGroupDepartureOutcome,
  BrowseGroupDeparture,
  JoinGroupDepartureInput,
  JoinGroupDepartureOutcome,
} from "./group-departures.js";
export type { MarketplaceActor } from "./types.js";
