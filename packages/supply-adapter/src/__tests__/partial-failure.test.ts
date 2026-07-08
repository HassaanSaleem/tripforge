// Multi-supplier cart simulation (contract items 9–10): one component's booking
// failure never invalidates a sibling's hold (INV-007 port guarantee), across
// two ports priced in DIFFERENT currencies with zero conversion (INV-009).
// The cart orchestration itself is seed-0005 — this pins the port-level
// properties that cart will rely on.
import { describe, expect, it } from "vitest";
import { SandboxActivityAdapter } from "../sandbox/activity.js";
import { SANDBOX_FAIL_BOOK_OFFER_ID } from "../sandbox/engine.js";
import { SandboxHotelAdapter } from "../sandbox/hotel.js";
import { makeFakeClock } from "./contract-suite.js";

describe("multi-supplier cart: partial failure (INV-007)", () => {
  it("a failed activity booking leaves the hotel hold bookable, currencies untouched", async () => {
    const clock = makeFakeClock();
    const hotel = new SandboxHotelAdapter(clock.now);
    const activity = new SandboxActivityAdapter(clock.now);

    // Assemble the cart: one hotel offer (USD) + the always-fails activity fixture (EUR).
    const hotelOffers = await hotel.search({
      destination: "Lisbon",
      checkIn: "2026-09-01",
      checkOut: "2026-09-05",
      guests: 2,
    });
    const hotelOffer = hotelOffers[0];
    if (!hotelOffer) {
      throw new Error("expected hotel inventory for Lisbon");
    }
    const hotelQuoted = await hotel.quote(hotelOffer.offerId);
    const activityQuoted = await activity.quote(SANDBOX_FAIL_BOOK_OFFER_ID);
    expect(hotelQuoted.status).toBe("quoted");
    expect(activityQuoted.status).toBe("quoted");
    if (hotelQuoted.status !== "quoted" || activityQuoted.status !== "quoted") {
      return;
    }
    expect(hotelQuoted.quote.netRate.currency).toBe("USD");
    expect(activityQuoted.quote.netRate.currency).toBe("EUR");

    // One component fails with a typed reason…
    const failed = await activity.book(activityQuoted.quote.quoteId);
    expect(failed).toEqual({
      status: "failed",
      quoteId: activityQuoted.quote.quoteId,
      reason: "supplier_rejected",
    });

    // …and the sibling hold survives: it books within its window at its quoted price.
    const confirmed = await hotel.book(hotelQuoted.quote.quoteId);
    expect(confirmed.status).toBe("confirmed");
    if (confirmed.status === "confirmed") {
      expect(confirmed.booking.quoteId).toBe(hotelQuoted.quote.quoteId);
    }
    expect(hotelQuoted.quote.netRate).toEqual(hotelOffer.netRate);
  });
});
