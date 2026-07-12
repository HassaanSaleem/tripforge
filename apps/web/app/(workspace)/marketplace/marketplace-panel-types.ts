// Shared UI-state types for the marketplace panel and its sibling components
// (browse/listing grid, sell form, license/receipt flow) — split out so those
// siblings don't need to import from each other or from the orchestrator.
import type { MyItinerariesOutput } from "../../../lib/trpc/client.js";
import type { LicenseReceipt, ListingFormValues } from "../../../lib/marketplace-flow.js";
import type { MarketplaceListing } from "../../../lib/marketplace-flow.js";

export type MyItinerary = MyItinerariesOutput["itineraries"][number];

export type BrowseState =
  | { phase: "loading" }
  | { phase: "loaded"; listings: MarketplaceListing[] }
  | { phase: "failed"; message: string };

export type PickerState =
  | { phase: "loading" }
  | { phase: "loaded"; itineraries: MyItinerary[] }
  | { phase: "failed"; message: string };

export type ListingFormState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "listed" }
  | { phase: "refused"; message: string };

export type LicenseState =
  | { listingId: string; kind: "busy" }
  | { listingId: string; kind: "receipt"; receipt: LicenseReceipt; title: string }
  | { listingId: string; kind: "refused"; message: string }
  | null;

export type RatingState =
  | { listingId: string; kind: "busy" }
  | { listingId: string; kind: "rated"; ratingAverage: number; ratingCount: number }
  | { listingId: string; kind: "refused"; message: string }
  | null;

export type DeactivateState =
  | { listingId: string; kind: "busy" }
  | { listingId: string; kind: "deactivated" }
  | { listingId: string; kind: "refused"; message: string }
  | null;

export const INITIAL_FORM: ListingFormValues = {
  itineraryId: "",
  title: "",
  feeMajor: "",
  licenseTerms: "",
  sharePercent: "10",
};
