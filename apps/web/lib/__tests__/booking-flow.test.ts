// L1 tests for the booking flow's pure view logic (spec 009 T005/T010/T013):
// markup percent → basis-point mapping (bounds + refusals), the FR-006 typed
// failure → message mappings (exhaustive — contract §3: only these strings ever
// reach the page), display formatting (research D7), the item-metadata join
// (research D4), and the shared transport-error mapping with booking wording
// (research D6) including the planner-delegation regression.
import { describe, it, expect } from "vitest";
import { TRPCClientError } from "@trpc/client";
import {
  bookFailureMessage,
  bookStatusLabel,
  bookingErrorMessage,
  formatHoldExpiry,
  formatMarkupBps,
  initialMarkupPercent,
  itemMetaIndex,
  itemMetaOf,
  quoteFailureMessage,
  toMarkupBps,
} from "../booking-flow.js";
import { draftErrorMessage } from "../planner-form.js";
import { transportErrorMessage } from "../transport-error.js";

function bpsOf(raw: string): number {
  const mapped = toMarkupBps(raw);
  if ("error" in mapped) {
    throw new Error(`expected bps, got refusal: ${mapped.error}`);
  }
  return mapped.bps;
}

function refusalOf(raw: string): string {
  const mapped = toMarkupBps(raw);
  if ("bps" in mapped) {
    throw new Error(`expected a refusal, got ${mapped.bps} bps`);
  }
  return mapped.error;
}

describe("toMarkupBps (FR-001/FR-002, research D5)", () => {
  it("maps the default and whole percents to integer basis points", () => {
    expect(bpsOf("15")).toBe(1500);
    expect(bpsOf("0")).toBe(0);
    expect(bpsOf("100")).toBe(10_000);
  });

  it("maps two-decimal percents exactly despite IEEE754", () => {
    expect(bpsOf("12.5")).toBe(1250);
    // 12.34 * 100 is 1233.999… in IEEE754 — the mapping must still yield 1234.
    expect(bpsOf("12.34")).toBe(1234);
    expect(bpsOf(" 7.25 ")).toBe(725);
  });

  it("refuses empty, non-numeric, out-of-bounds, and sub-bps values", () => {
    expect(refusalOf("")).toContain("Enter a markup");
    expect(refusalOf("abc")).toContain("must be a number");
    expect(refusalOf("-1")).toContain("between 0% and 100%");
    expect(refusalOf("101")).toContain("between 0% and 100%");
    expect(refusalOf("12.345")).toContain("two decimal places");
  });
});

describe("quoteFailureMessage (FR-003/FR-006) — exhaustive", () => {
  it("maps every quote-item failure reason to its pinned string", () => {
    expect(quoteFailureMessage("unknown_offer")).toBe(
      "This option is no longer available from the supplier. Draft again or re-quote to refresh.",
    );
    expect(quoteFailureMessage("no_rate")).toBe(
      "No exchange rate to the trip currency is available for this item.",
    );
    expect(quoteFailureMessage("already_booked")).toBe(
      "Already booked — this item is covered by an existing booking.",
    );
  });
});

describe("bookFailureMessage (FR-005/FR-006) — exhaustive", () => {
  it("maps every book-component failure reason to its pinned string", () => {
    expect(bookFailureMessage("quote_expired")).toBe(
      "The price hold expired before booking. Quote again for fresh prices.",
    );
    expect(bookFailureMessage("supplier_rejected")).toBe(
      "The supplier declined this booking. Quote again and retry.",
    );
    expect(bookFailureMessage("unknown_quote")).toBe(
      "The supplier no longer recognizes this hold. Quote again for fresh prices.",
    );
    expect(bookFailureMessage("already_consumed")).toBe(
      "This hold was already used by another booking.",
    );
    expect(bookFailureMessage("item_already_booked")).toBe(
      "This item is already booked — it was not booked twice.",
    );
  });
});

describe("bookStatusLabel (FR-005) — exhaustive", () => {
  it("labels every booking status", () => {
    expect(bookStatusLabel("confirmed")).toBe("Booking confirmed");
    expect(bookStatusLabel("partially_confirmed")).toBe("Booking partially confirmed");
    expect(bookStatusLabel("failed")).toBe("Booking failed — nothing was booked");
  });
});

describe("display formatting (research D7)", () => {
  it("renders server markup bps as a percent string", () => {
    expect(formatMarkupBps(0)).toBe("0%");
    expect(formatMarkupBps(1500)).toBe("15%");
    expect(formatMarkupBps(1225)).toBe("12.25%");
  });

  it("renders hold expiry as 'Held until {local time}'", () => {
    const formatted = formatHoldExpiry("2026-09-01T10:30:00.000Z");
    expect(formatted.startsWith("Held until ")).toBe(true);
    expect(formatted.length).toBeGreaterThan("Held until ".length);
  });
});

describe("initialMarkupPercent (seed-0028)", () => {
  it("defaults to 15 when the trip has no booked generation yet", () => {
    expect(initialMarkupPercent(null)).toBe("15");
  });

  it("seeds from the last booked generation's rate, not the default", () => {
    expect(initialMarkupPercent(2200)).toBe("22");
    expect(initialMarkupPercent(1225)).toBe("12.25");
    expect(initialMarkupPercent(0)).toBe("0");
  });

  it("round-trips back through toMarkupBps to the same bps (no client-side money math)", () => {
    expect(bpsOf(initialMarkupPercent(2200))).toBe(2200);
    expect(bpsOf(initialMarkupPercent(1225))).toBe(1225);
  });
});

describe("itemMetaIndex / itemMetaOf (research D4)", () => {
  const itinerary = {
    days: [
      { items: [{ id: "item-1", title: "Hotel Luz", kind: "stay" }] },
      { items: [{ id: "item-2", title: "Old Town Walk", kind: "activity" }] },
    ],
  };

  it("joins item ids to title + kind across days", () => {
    const index = itemMetaIndex(itinerary);
    expect(itemMetaOf(index, "item-1")).toEqual({ title: "Hotel Luz", kind: "stay" });
    expect(itemMetaOf(index, "item-2")).toEqual({ title: "Old Town Walk", kind: "activity" });
  });

  it("falls back to the raw id for unknown items, naming the empty id", () => {
    const index = itemMetaIndex(itinerary);
    expect(itemMetaOf(index, "ghost")).toEqual({ title: "ghost", kind: "item" });
    expect(itemMetaOf(index, "")).toEqual({ title: "Unknown item", kind: "item" });
  });
});

describe("bookingErrorMessage / transportErrorMessage (FR-006, research D6)", () => {
  function trpcError(code: string) {
    return new TRPCClientError("boom", {
      result: { error: { data: { code } } },
      // The runtime only reads error.data.code; the cast keeps the fixture lean.
    } as unknown as ConstructorParameters<typeof TRPCClientError>[1]);
  }

  it("maps UNAUTHORIZED to the shared session message", () => {
    expect(bookingErrorMessage(trpcError("UNAUTHORIZED"))).toBe(
      "Your session has expired. Please sign in again.",
    );
  });

  it("maps FORBIDDEN / BAD_REQUEST / NOT_FOUND to booking wording", () => {
    expect(bookingErrorMessage(trpcError("FORBIDDEN"))).toBe(
      "Booking requires an agency membership. Sign in with your agency account.",
    );
    expect(bookingErrorMessage(trpcError("BAD_REQUEST"))).toBe(
      "The server rejected the booking request. Refresh the quotes and try again.",
    );
    expect(bookingErrorMessage(trpcError("NOT_FOUND"))).toBe(
      "This itinerary is no longer available in your workspace.",
    );
  });

  it("falls back to the shared network message for everything else", () => {
    const messages = [
      bookingErrorMessage(new TRPCClientError("fetch failed")),
      bookingErrorMessage(new Error("x")),
      bookingErrorMessage(undefined),
    ];
    for (const message of messages) {
      expect(message).toBe("Could not reach the server. Check your connection and try again.");
    }
  });

  it("NOT_FOUND falls through to the network message when no wording is given", () => {
    expect(
      transportErrorMessage(trpcError("NOT_FOUND"), { forbidden: "f", badRequest: "b" }),
    ).toBe("Could not reach the server. Check your connection and try again.");
  });

  it("planner delegation keeps the draft wording unchanged (T003 regression)", () => {
    expect(draftErrorMessage(trpcError("FORBIDDEN"))).toBe(
      "Drafting requires an agency membership. Sign in with your agency account.",
    );
    expect(draftErrorMessage(trpcError("BAD_REQUEST"))).toBe(
      "The server rejected the trip details. Please check the form values and try again.",
    );
    // Draft wording defines no NOT_FOUND override — shared fallback applies.
    expect(draftErrorMessage(trpcError("NOT_FOUND"))).toBe(
      "Could not reach the server. Check your connection and try again.",
    );
  });
});
