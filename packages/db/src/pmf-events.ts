// PMF metric event recording (spec 004; INV-021, INV-009, INV-004).
//
// The recorder takes the CALLER's transaction executor and never opens its own
// transaction — "emitted in the same transaction as the business action they
// measure" (INV-021) is only guaranteeable when the action's own `tx` is handed
// in. Validation is hand-rolled (not zod): this package declares no zod
// dependency and the loop runtime cannot regenerate the pnpm lockfile to add
// one (spec 004 research D6); the matrix is small and exhaustively unit-tested.
import type { Db } from "./client.js";
import { pmfEvent } from "./schema.js";

/** Trip (plan) sources — feeds the resold:self-built PMF ratio. */
export const PMF_TRIP_SOURCES = ["self_built", "licensed"] as const;
export type PmfTripSource = (typeof PMF_TRIP_SOURCES)[number];

/**
 * Closed event vocabulary covering the four constitution-mandated PMF metrics
 * (GBV, take-rate revenue per active agent, resold:self-built, plan→book).
 * Extension is additive via the normal SDD flow — views filter by type.
 */
export type PmfEvent =
  | {
      type: "trip_created";
      agencyId: string;
      itineraryId: string;
      source: PmfTripSource;
      actorUserId?: string;
    }
  | {
      type: "booking_confirmed";
      agencyId: string;
      itineraryId: string;
      /** GBV contribution in integer minor units (INV-009). */
      amountMinor: number;
      /** ISO-4217 alpha-3, uppercase. */
      currency: string;
      actorUserId?: string;
    }
  | {
      type: "take_rate_accrued";
      agencyId: string;
      /** Platform revenue in integer minor units (INV-009). */
      amountMinor: number;
      currency: string;
      itineraryId?: string;
      actorUserId?: string;
      /**
       * Full license split (spec 006 FR-014) — set BOTH when the take was
       * accrued via a marketplace license. Conservation is enforced:
       * priceMinor = amountMinor (platform take) + sellerCreditMinor EXACTLY.
       */
      priceMinor?: number;
      sellerCreditMinor?: number;
    }
  // Marketplace liquidity observability (spec 006 research D4) — no-money
  // types; the license transaction's money is measured by take_rate_accrued
  // and the resold ratio by trip_created(source=licensed).
  | {
      type: "listing_created";
      agencyId: string;
      /** The LISTED (source) itinerary. */
      itineraryId: string;
      actorUserId?: string;
    }
  | {
      type: "listing_rated";
      agencyId: string;
      /** The rated listing's source itinerary. */
      itineraryId: string;
      actorUserId?: string;
    }
  // Group travel (spec 021 FR-013) — no-money post event mirrors listing_created;
  // seat-joined mirrors booking_confirmed's money shape (GBV contribution).
  | {
      type: "group_departure_posted";
      agencyId: string;
      /** The posted departure's underlying itinerary. */
      itineraryId: string;
      actorUserId?: string;
    }
  | {
      type: "group_departure_seat_joined";
      /** The departure-owning agency. */
      agencyId: string;
      itineraryId: string;
      /** Seat price in integer minor units (INV-009) — GBV contribution. */
      amountMinor: number;
      currency: string;
      actorUserId?: string;
    };

export type PmfEventValidationReason =
  | "unknown_type"
  | "missing_agency"
  | "missing_itinerary"
  | "missing_amount"
  | "non_integer_amount"
  | "negative_amount"
  | "missing_currency"
  | "malformed_currency"
  | "unexpected_money_fields"
  | "missing_source"
  | "invalid_source"
  | "unexpected_source"
  | "split_pair_incomplete"
  | "split_not_conserved";

export class PmfEventValidationError extends Error {
  readonly reason: PmfEventValidationReason;

  constructor(reason: PmfEventValidationReason, detail: string) {
    super(`invalid PMF event (${reason}): ${detail}`);
    this.name = "PmfEventValidationError";
    this.reason = reason;
  }
}

const PMF_EVENT_TYPES = [
  "trip_created",
  "booking_confirmed",
  "take_rate_accrued",
  "listing_created",
  "listing_rated",
  "group_departure_posted",
  "group_departure_seat_joined",
] as const;
const MONETARY_TYPES: ReadonlySet<string> = new Set([
  "booking_confirmed",
  "take_rate_accrued",
  "group_departure_seat_joined",
]);
const CURRENCY_RE = /^[A-Z]{3}$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Pure validation of the full per-type field matrix (data-model.md). Returns the
 * typed error (without throwing) or null when the event is valid.
 */
export function validatePmfEvent(event: unknown): PmfEventValidationError | null {
  const e = event as Record<string, unknown>;
  const type = e?.type;
  if (typeof type !== "string" || !PMF_EVENT_TYPES.includes(type as (typeof PMF_EVENT_TYPES)[number])) {
    return new PmfEventValidationError("unknown_type", `type=${String(type)}`);
  }
  if (!isNonEmptyString(e.agencyId)) {
    return new PmfEventValidationError("missing_agency", "agencyId is required (INV-004)");
  }
  if (
    (type === "trip_created" ||
      type === "booking_confirmed" ||
      type === "listing_created" ||
      type === "listing_rated" ||
      type === "group_departure_posted" ||
      type === "group_departure_seat_joined") &&
    !isNonEmptyString(e.itineraryId)
  ) {
    return new PmfEventValidationError("missing_itinerary", `${type} requires itineraryId`);
  }
  if (MONETARY_TYPES.has(type)) {
    if (typeof e.amountMinor !== "number") {
      return new PmfEventValidationError("missing_amount", `${type} requires amountMinor`);
    }
    if (!Number.isSafeInteger(e.amountMinor)) {
      return new PmfEventValidationError(
        "non_integer_amount",
        `amountMinor must be an integer minor-unit amount, got ${e.amountMinor}`,
      );
    }
    if (e.amountMinor < 0) {
      return new PmfEventValidationError("negative_amount", `amountMinor=${e.amountMinor}`);
    }
    if (!isNonEmptyString(e.currency)) {
      return new PmfEventValidationError("missing_currency", `${type} requires currency`);
    }
    if (!CURRENCY_RE.test(e.currency)) {
      return new PmfEventValidationError(
        "malformed_currency",
        `currency must be ISO-4217 alpha-3 uppercase, got "${e.currency}"`,
      );
    }
  } else if (e.amountMinor !== undefined || e.currency !== undefined) {
    return new PmfEventValidationError("unexpected_money_fields", `${type} carries no money`);
  }
  if (type === "take_rate_accrued") {
    const hasPrice = e.priceMinor !== undefined;
    const hasCredit = e.sellerCreditMinor !== undefined;
    if (hasPrice !== hasCredit) {
      return new PmfEventValidationError(
        "split_pair_incomplete",
        "priceMinor and sellerCreditMinor must be set together (FR-014 full split)",
      );
    }
    if (hasPrice) {
      for (const [field, value] of [
        ["priceMinor", e.priceMinor],
        ["sellerCreditMinor", e.sellerCreditMinor],
      ] as const) {
        if (typeof value !== "number" || !Number.isSafeInteger(value)) {
          return new PmfEventValidationError(
            "non_integer_amount",
            `${field} must be an integer minor-unit amount, got ${String(value)}`,
          );
        }
        if (value < 0) {
          return new PmfEventValidationError("negative_amount", `${field}=${value}`);
        }
      }
      // Row-local conservation (INV-011 spirit): the recorded split must add up
      // to the license price EXACTLY — price = platform take + seller credit.
      if ((e.priceMinor as number) !== (e.amountMinor as number) + (e.sellerCreditMinor as number)) {
        return new PmfEventValidationError(
          "split_not_conserved",
          `priceMinor=${String(e.priceMinor)} != amountMinor=${String(e.amountMinor)} + sellerCreditMinor=${String(e.sellerCreditMinor)}`,
        );
      }
    }
  } else if (e.priceMinor !== undefined || e.sellerCreditMinor !== undefined) {
    return new PmfEventValidationError(
      "unexpected_money_fields",
      `${type} carries no license split`,
    );
  }
  if (type === "trip_created") {
    if (e.source === undefined) {
      return new PmfEventValidationError("missing_source", "trip_created requires source");
    }
    if (!PMF_TRIP_SOURCES.includes(e.source as PmfTripSource)) {
      return new PmfEventValidationError("invalid_source", `source=${String(e.source)}`);
    }
  } else if (e.source !== undefined) {
    return new PmfEventValidationError("unexpected_source", `${type} carries no source`);
  }
  return null;
}

/**
 * The caller's write capability — a Drizzle transaction handle (the INV-021
 * path) or a Db (backfills/tests). Structural so both satisfy it.
 */
export type PmfEventExecutor = Pick<Db, "insert">;

/**
 * Validate then append one PMF event using the caller's executor. Throws
 * PmfEventValidationError BEFORE any write on invalid input; never opens or
 * commits a transaction of its own.
 */
export async function recordPmfEvent(executor: PmfEventExecutor, event: PmfEvent): Promise<void> {
  const invalid = validatePmfEvent(event);
  if (invalid) throw invalid;
  await executor.insert(pmfEvent).values({
    type: event.type,
    agencyId: event.agencyId,
    actorUserId: event.actorUserId ?? null,
    itineraryId: "itineraryId" in event ? (event.itineraryId ?? null) : null,
    source: event.type === "trip_created" ? event.source : null,
    amountMinor: "amountMinor" in event ? event.amountMinor : null,
    priceMinor: event.type === "take_rate_accrued" ? (event.priceMinor ?? null) : null,
    sellerCreditMinor: event.type === "take_rate_accrued" ? (event.sellerCreditMinor ?? null) : null,
    currency: "currency" in event ? event.currency : null,
  });
}
