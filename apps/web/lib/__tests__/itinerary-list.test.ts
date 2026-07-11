// L1 tests for the workspace trips panel's pure view logic (spec 012 T004,
// contract §6): created-date formatting is deterministic on any host (locale
// AND timezone pinned — research D6), and the transport-error mapping carries
// the trips wording (contract §2/§3 — only these strings ever reach the panel).
import { describe, it, expect } from "vitest";
import { TRPCClientError } from "@trpc/client";
import { formatCreatedDate, formatListedBadge, listErrorMessage, openErrorMessage } from "../itinerary-list.js";

function trpcError(code: string) {
  return new TRPCClientError("boom", {
    result: { error: { data: { code } } },
    // The runtime only reads error.data.code; the cast keeps the fixture lean.
  } as unknown as ConstructorParameters<typeof TRPCClientError>[1]);
}

describe("formatCreatedDate (research D6)", () => {
  it("renders an ISO timestamp as an en-GB short date in UTC", () => {
    expect(formatCreatedDate("2026-07-09T14:23:45.000Z")).toBe("9 Jul 2026");
  });

  it("stays on the UTC calendar day regardless of host timezone", () => {
    // 23:59 UTC would already be the next day in UTC+2 hosts; pinning
    // timeZone: "UTC" makes server HTML and client hydration agree.
    expect(formatCreatedDate("2026-12-31T23:59:59.000Z")).toBe("31 Dec 2026");
    expect(formatCreatedDate("2027-01-01T00:00:01.000Z")).toBe("1 Jan 2027");
  });
});

describe("formatListedBadge (spec 014 US2, FR-007)", () => {
  it("renders the listing's own fee and currency, no arithmetic", () => {
    expect(formatListedBadge({ priceMinor: 25_000, currency: "USD" })).toBe("Listed · 250.00 USD");
  });

  it("respects the currency's own fraction digits", () => {
    expect(formatListedBadge({ priceMinor: 450, currency: "JPY" })).toBe("Listed · 450 JPY");
  });
});

describe("listErrorMessage (contract §2)", () => {
  it("maps the authorization ladder to trips wording", () => {
    expect(listErrorMessage(trpcError("UNAUTHORIZED"))).toBe(
      "Your session has expired. Please sign in again.",
    );
    expect(listErrorMessage(trpcError("FORBIDDEN"))).toBe(
      "Your trips require an agency membership. Sign in with your agency account.",
    );
    expect(listErrorMessage(trpcError("BAD_REQUEST"))).toBe(
      "The server rejected the request. Reload the page and try again.",
    );
  });

  it("falls back to the shared network message for anything else", () => {
    expect(listErrorMessage(new Error("socket hang up"))).toBe(
      "Could not reach the server. Check your connection and try again.",
    );
  });
});

describe("openErrorMessage (contract §3)", () => {
  it("adds the NOT_FOUND wording for cross-tenant/gone trips", () => {
    expect(openErrorMessage(trpcError("NOT_FOUND"))).toBe("That trip is no longer available.");
  });

  it("shares the rest of the ladder with the list wording", () => {
    expect(openErrorMessage(trpcError("FORBIDDEN"))).toBe(
      "Your trips require an agency membership. Sign in with your agency account.",
    );
    expect(openErrorMessage(new Error("offline"))).toBe(
      "Could not reach the server. Check your connection and try again.",
    );
  });
});
