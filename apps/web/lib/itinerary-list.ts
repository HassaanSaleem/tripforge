// Pure display helpers for the workspace itinerary list (spec 012 contract
// §2/§6). DOM-free so the exact strings are pinned by L1 tests. Locale AND
// timezone are pinned (research D6): server HTML and client hydration must
// render the same text on any host, and the e2e asserts the visible date.
// No money logic lives here (FR-009 — amounts go through formatMinorAmount).
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
