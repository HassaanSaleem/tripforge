// Pure view logic for the workspace group-travel surface (spec 021 contracts
// §1-4): post-form input mapping (the fee major→minor conversion — this
// feature's only numeric input work, mirroring marketplace-flow.ts's fee
// mapping), exhaustive typed-refusal → human-message mapping, and display
// formatting. DOM-free so it runs under the root Vitest node environment; the
// page may only display strings that come from here (FR-009 precedent). The
// server stays authoritative for every money value — nothing here computes
// money beyond the one major→minor input conversion.
import { currencyFractionDigits, formatMinorAmount } from "./planner-form.js";
import { transportErrorMessage } from "./transport-error.js";
import type { BrowseGroupDeparturesOutput, JoinGroupDepartureOutput, PostGroupDepartureInput } from "./trpc/client.js";

export type GroupDeparture = BrowseGroupDeparturesOutput["departures"][number];
export type JoinGroupDepartureRefusal = Exclude<JoinGroupDepartureOutput, { status: "joined" }>;

export interface PostFormValues {
  itineraryId: string;
  departureDate: string;
  capacity: string;
  priceMajor: string;
}

export type PostFormMapping = { input: PostGroupDepartureInput } | { error: string };

/**
 * Map raw post-form values to the post procedure's input, or a human-readable
 * refusal (never throws). Converts the major-unit price to integer minor
 * units exactly once (marketplace-flow.ts's fee-mapping precedent).
 */
export function toPostGroupDepartureInput(values: PostFormValues, currency: string): PostFormMapping {
  if (values.itineraryId === "") {
    return { error: "Pick an itinerary to post as a group departure." };
  }
  if (values.departureDate === "") {
    return { error: "Pick a departure date." };
  }
  const capacity = Number(values.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) {
    return { error: "Capacity must be a whole number of 1 or more." };
  }
  const price = values.priceMajor.trim();
  if (price === "") {
    return { error: "Enter a per-seat price (0 allows free seats)." };
  }
  const major = Number(price);
  if (!Number.isFinite(major) || major < 0) {
    return { error: "Per-seat price must be a number of 0 or more." };
  }
  const digits = currencyFractionDigits(currency);
  const pricePerSeatMinor = Math.round(major * 10 ** digits);
  if (Math.abs(major * 10 ** digits - pricePerSeatMinor) > 1e-6) {
    return {
      error:
        digits === 0
          ? `Per-seat price must be a whole number of ${currency}.`
          : `Per-seat price supports at most ${digits} decimal places for ${currency}.`,
    };
  }
  return {
    input: { itineraryId: values.itineraryId, departureDate: values.departureDate, capacity, pricePerSeatMinor },
  };
}

/** One distinct human-readable message per typed join refusal (contracts §4).
 * Exhaustive over the server union; `not_found` never reaches here — the
 * router throws it as a TRPCError. */
export function joinGroupDepartureFailureMessage(outcome: JoinGroupDepartureRefusal): string {
  switch (outcome.status) {
    case "sold_out":
      return "This departure is fully booked — no seats remain.";
    case "not_active":
      return "This departure is no longer active.";
  }
}

/** Seats-remaining display (contracts §3): "X of N seats left". */
export function formatSeatsRemaining(seatsRemaining: number, capacity: number): string {
  return `${seatsRemaining} of ${capacity} seats left`;
}

/** Per-seat price display — formatMinorAmount only, no arithmetic here. */
export function formatSeatPrice(pricePerSeatMinor: number, currency: string): string {
  return `${formatMinorAmount(pricePerSeatMinor, currency)} / seat`;
}

/** Transport/authorization failures with group-travel wording, sharing the
 * UNAUTHORIZED + network strings with the marketplace/booking/planner flows
 * via transport-error.ts. */
export function groupTravelErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Group travel requires an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the request. Check the form values and try again.",
    notFound: "That itinerary or departure is no longer available.",
  });
}
