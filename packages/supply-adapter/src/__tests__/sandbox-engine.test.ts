// L2 — sandbox engine supplier-fidelity regression (seed-0015): quote ids are
// unique across engine INSTANCES, not just within one. A real supplier never
// re-mints another hold's quote id after losing its quote store; when the
// sandbox's per-instance counter collided with a persisted hold's id from an
// earlier instance, the book() idempotency replay let ONE live supplier
// booking back TWO booking components on the INV-028 re-establishment path.
import { describe, expect, it } from "vitest";
import { SandboxHotelAdapter } from "../sandbox/hotel.js";

const CRITERIA = {
  destination: "Lisbon",
  checkIn: "2026-09-01",
  checkOut: "2026-09-05",
  guests: 2,
};

describe("sandbox engine quote-id fidelity (seed-0015)", () => {
  it("two engine instances never mint the same quote id for the same offer", async () => {
    const a = new SandboxHotelAdapter();
    const b = new SandboxHotelAdapter();
    const offersA = await a.search(CRITERIA);
    const offerId = offersA[0]?.offerId;
    if (!offerId) throw new Error("expected sandbox inventory for the criteria");
    const offersB = await b.search(CRITERIA);
    expect(offersB.some((o) => o.offerId === offerId)).toBe(true);

    const qa = await a.quote(offerId);
    const qb = await b.quote(offerId);
    if (qa.status !== "quoted" || qb.status !== "quoted") throw new Error("expected both instances to quote");
    expect(qa.quote.quoteId).not.toBe(qb.quote.quoteId);

    // The collision's exact failure mode, pinned: instance B holds no memory
    // of A's quote, so booking A's id on B is a typed unknown_quote — never a
    // replay of one of B's own bookings.
    await expect(b.book(qa.quote.quoteId)).resolves.toMatchObject({
      status: "failed",
      reason: "unknown_quote",
    });
  });
});
