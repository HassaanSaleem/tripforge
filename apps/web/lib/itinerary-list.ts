// Pure display helpers for the workspace itinerary list (spec 012 contract
// §2/§6). DOM-free so the exact strings are pinned by L1 tests. Locale AND
// timezone are pinned (research D6): server HTML and client hydration must
// render the same text on any host, and the e2e asserts the visible date.
// No money logic lives here (FR-009 — amounts go through formatMinorAmount).
import { formatBps } from "./basis-points.js";
import { formatMinorAmount } from "./planner-form.js";
import { transportErrorMessage } from "./transport-error.js";

const CREATED_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** ISO-8601 timestamp → "9 Jul 2026" (en-GB short month, UTC). */
export function formatCreatedDate(iso: string): string {
  return CREATED_DATE.format(new Date(iso));
}

/** "Listed" badge text for a trip with an active marketplace listing (spec
 * 014 US2, FR-007): the listing's own fee/currency, no arithmetic here. */
export function formatListedBadge(listing: { priceMinor: number; currency: string }): string {
  return `Listed · ${formatMinorAmount(listing.priceMinor, listing.currency)}`;
}

/** Licensed-copy badge text (spec 024 FR-001/FR-002): names the ORIGINAL
 * author, never an intermediate reseller — server-derived, no free text. */
export function formatLicensedCopyBadge(licensedCopy: { originalAuthorAgencyName: string; generation: number }): string {
  return `Licensed copy · original by ${licensedCopy.originalAuthorAgencyName}`;
}

/**
 * Transport/authorization failures with trips-list wording (FR-008); shares
 * the UNAUTHORIZED + network strings with every other workspace panel via
 * transport-error.ts.
 */
export function listErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Your trips require an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the request. Reload the page and try again.",
  });
}

/** Same mapping for the open/continue read (NOT_FOUND covers cross-tenant probes). */
export function openErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Your trips require an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the request. Reload the page and try again.",
    notFound: "That trip is no longer available.",
  });
}

/**
 * Booked/remaining summary for the reopened workspace trip (seed-0027): the
 * counts are arithmetic over an already-typed set (`bookedItemIds.length` vs
 * the document's own item count), never a money computation — FR-007 only
 * restricts client-side PRICE math. Visible without running a fresh quote.
 */
export function bookedSummaryLabel(bookedCount: number, totalCount: number): string {
  if (bookedCount === 0) return "Nothing booked yet.";
  const noun = totalCount === 1 ? "item" : "items";
  if (bookedCount === totalCount) return `All ${totalCount} ${noun} booked.`;
  return `${bookedCount} of ${totalCount} ${noun} booked.`;
}

/**
 * The realized markup of the trip's most recently booked generation
 * (seed-0027/seed-0028): null renders nothing (contract: nothing booked yet).
 * `formatBps` is the same server-integer → display-percent formatter the
 * booking flow already uses to seed its markup input — no client money math.
 */
export function realizedMarkupLabel(latestBookedMarkupBps: number | null): string | null {
  return latestBookedMarkupBps === null ? null : `Booked at ${formatBps(latestBookedMarkupBps)} markup.`;
}
