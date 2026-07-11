// Pure view logic for the workspace booking flow (spec 009 research D4–D7):
// markup percent → integer-basis-point mapping with pre-submit validation,
// typed quote/book failure → human-readable message mapping, display formatting
// for markup rates and hold expiry, and the itinerary item-metadata join.
// DOM-free so it runs under the root Vitest node environment; the component may
// only display strings that come from here (contract §3). The server stays
// authoritative for every money value and booking outcome (FR-007/FR-008) —
// nothing here computes money.
import { bpsToPercentInput, formatBps, percentToBps } from "./basis-points.js";
import { transportErrorMessage } from "./transport-error.js";
import type { BookOutput, DraftOutput, QuoteOutput } from "./trpc/client.js";

export type DraftedItinerary = Extract<DraftOutput, { status: "drafted" }>["itinerary"];

export type QuoteItem = QuoteOutput["items"][number];
export type HeldQuoteItem = Extract<QuoteItem, { outcome: "held" }>;
type QuoteFailureReason = Extract<QuoteItem, { outcome: "failed" }>["reason"];

export type BookComponent = BookOutput["components"][number];
type BookFailureReason = Extract<BookComponent, { outcome: "failed" }>["reason"];
type BookStatus = BookOutput["status"];

/**
 * Map the markup input's raw percent string to the quote procedure's integer
 * basis-point unit (research D5) — the one numeric input conversion this
 * feature performs (FR-002/FR-007). Never throws; refusals are inline messages.
 */
export function toMarkupBps(raw: string): { bps: number } | { error: string } {
  // Shared digit-exact mapping (spec 011 research D5); subject interpolation
  // keeps every message string this module ever returned byte-identical.
  return percentToBps(raw, "Markup");
}

/**
 * One distinct human-readable message per typed quote-item failure (FR-006,
 * data-model mapping table). Exhaustive over the server union — a new server
 * reason fails compilation here instead of leaking raw text to the page.
 */
export function quoteFailureMessage(reason: QuoteFailureReason): string {
  switch (reason) {
    case "unknown_offer":
      return "This option is no longer available from the supplier. Draft again or re-quote to refresh.";
    case "no_rate":
      return "No exchange rate to the trip currency is available for this item.";
    case "already_booked":
      return "Already booked — this item is covered by an existing booking.";
  }
}

/**
 * One distinct human-readable message per typed book-component failure
 * (FR-006, data-model mapping table). Exhaustive over the server union.
 */
export function bookFailureMessage(reason: BookFailureReason): string {
  switch (reason) {
    case "quote_expired":
      return "The price hold expired before booking. Quote again for fresh prices.";
    case "supplier_rejected":
      return "The supplier declined this booking. Quote again and retry.";
    case "unknown_quote":
      return "The supplier no longer recognizes this hold. Quote again for fresh prices.";
    case "already_consumed":
      return "This hold was already used by another booking.";
    case "item_already_booked":
      return "This item is already booked — it was not booked twice.";
  }
}

/** Overall booking status → label (data-model mapping table). */
export function bookStatusLabel(status: BookStatus): string {
  switch (status) {
    case "confirmed":
      return "Booking confirmed";
    case "partially_confirmed":
      return "Booking partially confirmed";
    case "failed":
      return "Booking failed — nothing was booked";
  }
}

/**
 * Render the server-returned markup rate for display (research D7): 1500 →
 * "15%". Scaling a rate for display is not money arithmetic — every price
 * shown next to it is the server's own integer (FR-007).
 */
export function formatMarkupBps(bps: number): string {
  return formatBps(bps);
}

/** Default markup input, in percent (matches the form's original hardcoded default). */
export const DEFAULT_MARKUP_PERCENT = "15";

/**
 * Seed the markup input from the trip's own booking history (seed-0028):
 * the most recently booked generation's rate when one exists, else the
 * form's default — never a client-side guess.
 */
export function initialMarkupPercent(latestBookedMarkupBps: number | null): string {
  return latestBookedMarkupBps === null ? DEFAULT_MARKUP_PERCENT : bpsToPercentInput(latestBookedMarkupBps);
}

/**
 * Hold expiry as viewer-local time (research D7): the useful form of "act
 * before it lapses" (INV-006 surfaced). Tests pin the structure, not the
 * wall-clock value.
 */
export function formatHoldExpiry(iso: string): string {
  const time = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
  return `Held until ${time}`;
}

export interface ItemMeta {
  title: string;
  kind: string;
}

/** The slice of the canonical document the display join reads (research D4). */
interface ItineraryItemsLike {
  days: ReadonlyArray<{ items: ReadonlyArray<{ id: string; title: string; kind: string }> }>;
}

/**
 * Display join (research D4): quote/book outcomes carry item ids only; the
 * rendered canonical document supplies title + kind. Read-only projection —
 * the document is never modified (Constitution IV).
 */
export function itemMetaIndex(itinerary: ItineraryItemsLike): Map<string, ItemMeta> {
  const index = new Map<string, ItemMeta>();
  for (const day of itinerary.days) {
    for (const item of day.items) {
      index.set(item.id, { title: item.title, kind: item.kind });
    }
  }
  return index;
}

/** Unknown ids (typed-possible, impossible today) fall back to the raw id;
 * the server's unknown-hold outcome carries an empty item id. */
export function itemMetaOf(index: Map<string, ItemMeta>, itemId: string): ItemMeta {
  return index.get(itemId) ?? { title: itemId.length > 0 ? itemId : "Unknown item", kind: "item" };
}

/**
 * Transport/authorization failures with booking wording (FR-006, data-model
 * transport table); shares the UNAUTHORIZED + network strings with the planner
 * via transport-error.ts (research D6).
 */
export function bookingErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Booking requires an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the booking request. Refresh the quotes and try again.",
    notFound: "This itinerary is no longer available in your workspace.",
  });
}
