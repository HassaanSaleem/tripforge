// L1 tests for the client-view feature's pure view logic (spec 010 T010):
// share path → absolute URL join, transport-error mapping with share wording
// (contract §4), and the traveler page's schedule-line/kind-label formatting
// (contract §3 — only these strings ever reach the pages).
import { describe, it, expect } from "vitest";
import { TRPCClientError } from "@trpc/client";
import type { ClientViewMedia } from "@tripforge/api";
import { shareErrorMessage, shareUrl } from "../share-control.js";
import { itemKindLabel, priceQualifier, scheduleLine, totalIncludesEstimates } from "../client-view.js";

const NO_MEDIA: ClientViewMedia[] = [];

function trpcError(code: string) {
  return new TRPCClientError("boom", {
    result: { error: { data: { code } } },
    // The runtime only reads error.data.code; the cast keeps the fixture lean.
  } as unknown as ConstructorParameters<typeof TRPCClientError>[1]);
}

describe("shareUrl (contract §4, research D5)", () => {
  it("joins the server path with the browser origin", () => {
    expect(shareUrl("/view/6f9619ff-8b86-4d01-b42d-00cf4fc964ff", "http://localhost:3000")).toBe(
      "http://localhost:3000/view/6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    );
  });

  it("respects non-default origins (alternate-port stacks)", () => {
    expect(shareUrl("/view/abc-token", "https://agency.example.com:8443")).toBe(
      "https://agency.example.com:8443/view/abc-token",
    );
  });
});

describe("shareErrorMessage (contract §4)", () => {
  it("maps the authorization ladder and NOT_FOUND to share wording", () => {
    expect(shareErrorMessage(trpcError("UNAUTHORIZED"))).toBe(
      "Your session has expired. Please sign in again.",
    );
    expect(shareErrorMessage(trpcError("FORBIDDEN"))).toBe(
      "Sharing requires an agency membership. Sign in with your agency account.",
    );
    expect(shareErrorMessage(trpcError("BAD_REQUEST"))).toBe(
      "The server rejected the share request. Draft the itinerary again and retry.",
    );
    expect(shareErrorMessage(trpcError("NOT_FOUND"))).toBe(
      "This itinerary is no longer available in your workspace.",
    );
  });

  it("falls back to the shared network message for anything else", () => {
    expect(shareErrorMessage(new Error("boom"))).toBe(
      "Could not reach the server. Check your connection and try again.",
    );
  });
});

describe("itemKindLabel / scheduleLine (traveler page strings, contract §3)", () => {
  it("labels every kind traveler-friendly", () => {
    expect(itemKindLabel("stay")).toBe("Stay");
    expect(itemKindLabel("activity")).toBe("Activity");
    expect(itemKindLabel("transfer")).toBe("Transfer");
  });

  it("builds the stay line with occupancy pluralization", () => {
    expect(
      scheduleLine({
        kind: "stay",
        title: "Hotel Baixa",
        booked: false,
        sellMinor: 52000,
        checkIn: "2026-09-01",
        checkOut: "2026-09-03",
        adults: 1,
        children: 1,
        media: [],
      }),
    ).toBe("Check-in 2026-09-01 · check-out 2026-09-03 · 1 adult, 1 child");
    expect(
      scheduleLine({
        kind: "stay",
        title: "Hotel Baixa",
        booked: false,
        sellMinor: null,
        checkIn: "2026-09-01",
        checkOut: "2026-09-03",
        adults: 2,
        children: 0,
        media: [],
      }),
    ).toBe("Check-in 2026-09-01 · check-out 2026-09-03 · 2 adults");
  });

  it("builds the activity line from whichever facts exist — null when none do", () => {
    expect(
      scheduleLine({
        kind: "activity",
        title: "Fado evening",
        booked: false,
        sellMinor: null,
        startsAt: "2026-09-01T20:00:00Z",
        durationMinutes: 120,
        media: [],
      }),
    ).toBe("Starts 2026-09-01T20:00:00Z · 120 min");
    expect(
      scheduleLine({ kind: "activity", title: "Fado evening", booked: false, sellMinor: null, media: [] }),
    ).toBeNull();
  });

  it("builds the transfer route line", () => {
    expect(
      scheduleLine({
        kind: "transfer",
        title: "Airport transfer",
        booked: true,
        sellMinor: 4000,
        from: "LIS Airport",
        to: "Hotel Baixa",
        mode: "private",
        media: [],
      }),
    ).toBe("LIS Airport → Hotel Baixa · private");
  });
});

describe("priceQualifier / totalIncludesEstimates (spec 013 FR-004)", () => {
  const priced = (booked: boolean) =>
    ({ kind: "activity" as const, title: "Fado evening", booked, sellMinor: 9900, media: NO_MEDIA });
  const unpriced = { kind: "activity" as const, title: "Free stroll", booked: false, sellMinor: null, media: NO_MEDIA };

  it("a priced, un-booked item is an estimate; a booked price is confirmed; unpriced has no qualifier", () => {
    expect(priceQualifier(priced(false))).toBe("estimate");
    expect(priceQualifier(priced(true))).toBeNull();
    expect(priceQualifier(unpriced)).toBeNull();
  });

  it("the total includes estimates exactly when some shown price is un-booked", () => {
    expect(totalIncludesEstimates([priced(true), unpriced])).toBe(false);
    expect(totalIncludesEstimates([priced(true), priced(false)])).toBe(true);
    expect(totalIncludesEstimates([])).toBe(false);
  });
});
