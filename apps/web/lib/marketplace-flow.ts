// Pure view logic for the workspace marketplace surface (spec 011 contract §6,
// research D4/D5/D7/D8): listing-form input mapping (the fee major→minor and
// share percent→bps conversions — the feature's ONLY numeric input work),
// exhaustive typed-refusal → human-message mapping, and display formatting for
// share rates and ratings. DOM-free so it runs under the root Vitest node
// environment; the page may only display strings that come from here (FR-009).
// The server stays authoritative for every money value (FR-003/SC-004) —
// nothing here computes money.
import { percentToBps, formatBps } from "./basis-points.js";
import { currencyFractionDigits } from "./planner-form.js";
import { transportErrorMessage } from "./transport-error.js";
import type {
  BrowseListingsOutput,
  CreateListingInput,
  CreateListingOutput,
  LicenseListingOutput,
} from "./trpc/client.js";

export type MarketplaceListing = BrowseListingsOutput["listings"][number];
export type CreateListingRefusal = Exclude<CreateListingOutput, { status: "listed" }>;
export type LicenseReceipt = Extract<LicenseListingOutput, { status: "licensed" }>;
export type LicenseRefusal = Exclude<LicenseListingOutput, { status: "licensed" }>;

export interface ListingFormValues {
  itineraryId: string;
  title: string;
  /** License fee in MAJOR units of the picked itinerary's currency. */
  feeMajor: string;
  licenseTerms: string;
  sharePercent: string;
}

export type CreateListingMapping = { input: CreateListingInput } | { error: string };

/**
 * Map raw listing-form values to the createListing procedure's input, or a
 * human-readable refusal (never throws). Converts the major-unit fee to
 * integer minor units exactly once (research D4 — the planner budget-input
 * precedent) and the share percent to basis points via the shared mapper
 * (research D5). The currency is the picked itinerary's own — read, not chosen.
 */
export function toCreateListingInput(values: ListingFormValues, currency: string): CreateListingMapping {
  if (values.itineraryId === "") {
    return { error: "Pick an itinerary to list." };
  }
  const title = values.title.trim();
  if (title === "") {
    return { error: "Enter a listing title." };
  }
  const licenseTerms = values.licenseTerms.trim();
  if (licenseTerms === "") {
    return { error: "Enter the license terms a reseller agrees to." };
  }
  const fee = values.feeMajor.trim();
  if (fee === "") {
    return { error: "Enter a license fee (0 lists it free)." };
  }
  const major = Number(fee);
  if (!Number.isFinite(major) || major < 0) {
    return { error: "License fee must be a number of 0 or more." };
  }
  const digits = currencyFractionDigits(currency);
  const priceMinor = Math.round(major * 10 ** digits);
  if (Math.abs(major * 10 ** digits - priceMinor) > 1e-6) {
    return {
      error:
        digits === 0
          ? `License fee must be a whole number of ${currency}.`
          : `License fee supports at most ${digits} decimal places for ${currency}.`,
    };
  }
  const share = percentToBps(values.sharePercent, "Revenue share");
  if ("error" in share) {
    return { error: share.error };
  }
  return {
    input: {
      itineraryId: values.itineraryId,
      title,
      priceMinor,
      licenseTerms,
      revenueShareBps: share.bps,
    },
  };
}

/**
 * One distinct human-readable message per typed listing refusal (FR-005,
 * data-model mapping table). Exhaustive over the server union — a new server
 * refusal fails compilation here instead of leaking raw data to the page.
 */
export function createListingFailureMessage(outcome: CreateListingRefusal): string {
  switch (outcome.status) {
    case "not_vetted":
      return "Your agency isn't vetted for the marketplace yet — vetting is a platform-operator action. Until then you can browse, but not list.";
    case "already_listed":
      return "This itinerary already has an active marketplace listing.";
    case "provenance_incomplete":
      return `This itinerary can't be listed until its provenance is complete: ${outcome.issues.join("; ")}.`;
  }
}

/**
 * One distinct human-readable message per typed licensing refusal (FR-007,
 * data-model mapping table). Exhaustive over the server union.
 */
export function licenseFailureMessage(outcome: LicenseRefusal): string {
  switch (outcome.status) {
    case "not_vetted":
      return "Licensing needs both agencies vetted for the marketplace — vetting is a platform-operator action.";
    case "own_listing":
      return "This is your agency's own listing — the original is already in your workspace.";
    case "not_active":
      return "This listing has left the marketplace. Refresh to see what's available now.";
    case "already_licensed":
      return "Your agency already licensed this trip — the white-label copy is in your workspace.";
  }
}

/** Share-rate display (contract §6): server basis points → "7.5%". */
export function formatShareBps(bps: number): string {
  return formatBps(bps);
}

/**
 * Rating display (research D8): an explicit unrated state — the page never
 * invents a default score — else the aggregate exactly as the server keeps it.
 */
export function formatRating(average: number | null, count: number): string {
  if (average === null || count === 0) {
    return "Not yet rated";
  }
  return `★ ${average.toFixed(1)} (${count})`;
}

/**
 * Transport/authorization failures with marketplace wording (FR-008,
 * data-model transport table); shares the UNAUTHORIZED + network strings with
 * the planner and booking flows via transport-error.ts.
 */
export function marketplaceErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "The marketplace requires an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the request. Check the form values and try again.",
    notFound: "That itinerary or listing is no longer available.",
  });
}
