// L1 unit matrix for PMF event validation + the transactional recorder shape
// (spec 004 FR-007/FR-014, SC-004 unit witness). The executor is stubbed at the
// port boundary (Drizzle insert capability) — never the module's own internals.
import { describe, expect, it, vi } from "vitest";

import {
  PmfEventValidationError,
  recordPmfEvent,
  validatePmfEvent,
  type PmfEvent,
  type PmfEventExecutor,
} from "../pmf-events.js";
import { pmfEvent } from "../schema.js";

const validTripCreated: PmfEvent = {
  type: "trip_created",
  agencyId: "agency-1",
  itineraryId: "itin-1",
  source: "self_built",
};

const validBookingConfirmed: PmfEvent = {
  type: "booking_confirmed",
  agencyId: "agency-1",
  itineraryId: "itin-1",
  amountMinor: 250_000,
  currency: "USD",
  actorUserId: "user-1",
};

const validTakeRateAccrued: PmfEvent = {
  type: "take_rate_accrued",
  agencyId: "agency-2",
  amountMinor: 5_000,
  currency: "EUR",
};

/** Stub executor capturing insert(table).values(row) calls. */
function stubExecutor() {
  const calls: { table: unknown; row: unknown }[] = [];
  const executor = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (row: unknown) => {
        calls.push({ table, row });
      }),
    })),
  } as unknown as PmfEventExecutor;
  return { executor, calls };
}

describe("validatePmfEvent", () => {
  it("accepts all three valid event types", () => {
    expect(validatePmfEvent(validTripCreated)).toBeNull();
    expect(validatePmfEvent(validBookingConfirmed)).toBeNull();
    expect(validatePmfEvent(validTakeRateAccrued)).toBeNull();
  });

  // Every PmfEventValidationReason is reachable:
  it.each([
    ["unknown_type", { ...validTripCreated, type: "plan_created" }],
    ["missing_agency", { ...validTripCreated, agencyId: "" }],
    ["missing_itinerary", { ...validBookingConfirmed, itineraryId: undefined }],
    ["missing_amount", { ...validTakeRateAccrued, amountMinor: undefined }],
    ["non_integer_amount", { ...validBookingConfirmed, amountMinor: 2500.5 }],
    ["negative_amount", { ...validTakeRateAccrued, amountMinor: -1 }],
    ["missing_currency", { ...validBookingConfirmed, currency: undefined }],
    ["malformed_currency", { ...validTakeRateAccrued, currency: "eur" }],
    ["unexpected_money_fields", { ...validTripCreated, amountMinor: 100, currency: "USD" }],
    ["missing_source", { ...validTripCreated, source: undefined }],
    ["invalid_source", { ...validTripCreated, source: "resold" }],
    ["unexpected_source", { ...validBookingConfirmed, source: "self_built" }],
  ])("rejects with reason %s", (reason, event) => {
    const err = validatePmfEvent(event);
    expect(err).toBeInstanceOf(PmfEventValidationError);
    expect(err?.reason).toBe(reason);
  });

  it("rejects float money even when close to an integer (INV-009)", () => {
    expect(validatePmfEvent({ ...validBookingConfirmed, amountMinor: 100.000001 })?.reason).toBe(
      "non_integer_amount",
    );
  });

  it("rejects unsafe-integer money", () => {
    expect(
      validatePmfEvent({ ...validBookingConfirmed, amountMinor: Number.MAX_SAFE_INTEGER + 2 })
        ?.reason,
    ).toBe("non_integer_amount");
  });
});

describe("recordPmfEvent", () => {
  it("maps trip_created to the exact row shape", async () => {
    const { executor, calls } = stubExecutor();
    await recordPmfEvent(executor, validTripCreated);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe(pmfEvent);
    expect(calls[0]?.row).toEqual({
      type: "trip_created",
      agencyId: "agency-1",
      actorUserId: null,
      itineraryId: "itin-1",
      source: "self_built",
      amountMinor: null,
      currency: null,
    });
  });

  it("maps booking_confirmed to the exact row shape (money + actor)", async () => {
    const { executor, calls } = stubExecutor();
    await recordPmfEvent(executor, validBookingConfirmed);
    expect(calls[0]?.row).toEqual({
      type: "booking_confirmed",
      agencyId: "agency-1",
      actorUserId: "user-1",
      itineraryId: "itin-1",
      source: null,
      amountMinor: 250_000,
      currency: "USD",
    });
  });

  it("maps take_rate_accrued without itinerary to a null reference", async () => {
    const { executor, calls } = stubExecutor();
    await recordPmfEvent(executor, validTakeRateAccrued);
    expect(calls[0]?.row).toEqual({
      type: "take_rate_accrued",
      agencyId: "agency-2",
      actorUserId: null,
      itineraryId: null,
      source: null,
      amountMinor: 5_000,
      currency: "EUR",
    });
  });

  it("throws BEFORE any executor call on invalid input (never writes)", async () => {
    const { executor, calls } = stubExecutor();
    await expect(
      recordPmfEvent(executor, { ...validBookingConfirmed, amountMinor: 1.5 } as PmfEvent),
    ).rejects.toBeInstanceOf(PmfEventValidationError);
    expect(calls).toHaveLength(0);
    expect(executor.insert).not.toHaveBeenCalled();
  });

  it("makes exactly one insert per event and never manages a transaction itself", async () => {
    // INV-021 shape: the recorder uses ONLY the caller-provided executor — it has
    // no access to a connection/transaction API beyond `insert`, so an action
    // rollback necessarily takes the event with it (live proof: oracle check 7).
    const { executor, calls } = stubExecutor();
    await recordPmfEvent(executor, validTripCreated);
    await recordPmfEvent(executor, validTakeRateAccrued);
    expect(calls).toHaveLength(2);
    expect(executor.insert).toHaveBeenCalledTimes(2);
  });
});
