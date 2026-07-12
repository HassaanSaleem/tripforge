// L1 — pure marketplace view logic (spec 011 contract §6, FR-009): the
// listing-form input mapping (fee major→minor, share percent→bps), the
// EXHAUSTIVE typed-refusal → message tables (FR-005/FR-007), rating/share
// display, and the marketplace transport wording. Also pins the research-D5
// generalization: the shared percent→bps mapper keeps booking-flow's markup
// wording byte-identical (its own suite re-verifies) while carrying the
// revenue-share wording here.
import { describe, it, expect } from "vitest";
import { TRPCClientError } from "@trpc/client";
import { percentToBps, formatBps } from "../basis-points.js";
import {
  createListingFailureMessage,
  deactivateListingFailureMessage,
  formatEarnings,
  formatRating,
  formatShareBps,
  licenseFailureMessage,
  marketplaceErrorMessage,
  rateListingFailureMessage,
  toCreateListingInput,
  type ListingFormValues,
} from "../marketplace-flow.js";

const VALID: ListingFormValues = {
  itineraryId: "5f6cbe0e-1d4b-4f2b-9b3a-9adf6f4f2c11",
  title: "Paris on a budget — proven weekender",
  feeMajor: "250",
  licenseTerms: "White-label permitted; keep attribution lineage.",
  sharePercent: "10",
};

describe("toCreateListingInput (FR-003/FR-004, research D4/D5)", () => {
  it("maps a valid form to the procedure input with the fee in minor units", () => {
    const mapped = toCreateListingInput(VALID, "EUR");
    expect(mapped).toEqual({
      input: {
        itineraryId: VALID.itineraryId,
        title: VALID.title,
        priceMinor: 25_000,
        licenseTerms: VALID.licenseTerms,
        revenueShareBps: 1_000,
      },
    });
  });

  it("converts decimal fees exactly once per the currency's fraction digits", () => {
    const mapped = toCreateListingInput({ ...VALID, feeMajor: "4.56" }, "EUR");
    expect(mapped).toMatchObject({ input: { priceMinor: 456 } });
  });

  it("accepts a zero fee (free listing is a server-legal input)", () => {
    expect(toCreateListingInput({ ...VALID, feeMajor: "0" }, "EUR")).toMatchObject({
      input: { priceMinor: 0 },
    });
  });

  it("handles zero-decimal currencies", () => {
    expect(toCreateListingInput({ ...VALID, feeMajor: "450" }, "JPY")).toMatchObject({
      input: { priceMinor: 450 },
    });
    expect(toCreateListingInput({ ...VALID, feeMajor: "450.5" }, "JPY")).toEqual({
      error: "License fee must be a whole number of JPY.",
    });
  });

  it("refuses an un-picked itinerary, empty title, and empty terms distinctly", () => {
    expect(toCreateListingInput({ ...VALID, itineraryId: "" }, "EUR")).toEqual({
      error: "Pick an itinerary to list.",
    });
    expect(toCreateListingInput({ ...VALID, title: "   " }, "EUR")).toEqual({
      error: "Enter a listing title.",
    });
    expect(toCreateListingInput({ ...VALID, licenseTerms: "" }, "EUR")).toEqual({
      error: "Enter the license terms a reseller agrees to.",
    });
  });

  it("refuses empty, non-numeric, negative, and over-precise fees", () => {
    expect(toCreateListingInput({ ...VALID, feeMajor: "" }, "EUR")).toEqual({
      error: "Enter a license fee (0 lists it free).",
    });
    expect(toCreateListingInput({ ...VALID, feeMajor: "abc" }, "EUR")).toEqual({
      error: "License fee must be a number of 0 or more.",
    });
    expect(toCreateListingInput({ ...VALID, feeMajor: "-1" }, "EUR")).toEqual({
      error: "License fee must be a number of 0 or more.",
    });
    expect(toCreateListingInput({ ...VALID, feeMajor: "4.567" }, "EUR")).toEqual({
      error: "License fee supports at most 2 decimal places for EUR.",
    });
  });

  it("maps the share through the shared mapper with revenue-share wording", () => {
    expect(toCreateListingInput({ ...VALID, sharePercent: "7.5" }, "EUR")).toMatchObject({
      input: { revenueShareBps: 750 },
    });
    expect(toCreateListingInput({ ...VALID, sharePercent: "" }, "EUR")).toEqual({
      error: "Enter a revenue share percentage (0–100).",
    });
    expect(toCreateListingInput({ ...VALID, sharePercent: "101" }, "EUR")).toEqual({
      error: "Revenue share must be between 0% and 100%.",
    });
    expect(toCreateListingInput({ ...VALID, sharePercent: "abc" }, "EUR")).toEqual({
      error: "Revenue share must be a number between 0 and 100.",
    });
    expect(toCreateListingInput({ ...VALID, sharePercent: "7.125" }, "EUR")).toEqual({
      error: "Revenue share supports at most two decimal places (e.g. 12.25).",
    });
  });
});

describe("percentToBps / formatBps (research D5 — the generalized mapper)", () => {
  it("interpolates the subject into every refusal", () => {
    expect(percentToBps("", "Markup")).toEqual({ error: "Enter a markup percentage (0–100)." });
    expect(percentToBps("12.25", "Markup")).toEqual({ bps: 1225 });
  });

  it("scales basis points for display only", () => {
    expect(formatBps(0)).toBe("0%");
    expect(formatBps(750)).toBe("7.5%");
    expect(formatBps(1225)).toBe("12.25%");
  });
});

describe("createListingFailureMessage (FR-005, exhaustive)", () => {
  it("maps every typed listing refusal to a distinct plain-language message", () => {
    const notVetted = createListingFailureMessage({ status: "not_vetted" });
    const alreadyListed = createListingFailureMessage({ status: "already_listed", listingId: "x" });
    const provenance = createListingFailureMessage({
      status: "provenance_incomplete",
      issues: ["provenance.licenseTerms: Required", "provenance.revenueShareBps: Required"],
    });
    expect(notVetted).toContain("vetted");
    expect(alreadyListed).toContain("already has an active marketplace listing");
    expect(provenance).toContain("provenance.licenseTerms: Required");
    expect(provenance).toContain("provenance.revenueShareBps: Required");
    expect(new Set([notVetted, alreadyListed, provenance]).size).toBe(3);
  });
});

describe("licenseFailureMessage (FR-007, exhaustive)", () => {
  it("maps every typed licensing refusal to a distinct plain-language message", () => {
    const messages = [
      licenseFailureMessage({ status: "not_vetted" }),
      licenseFailureMessage({ status: "own_listing" }),
      licenseFailureMessage({ status: "not_active" }),
      licenseFailureMessage({ status: "already_licensed", licenseId: "x" }),
    ];
    expect(messages[0]).toContain("vetted");
    expect(messages[1]).toContain("own listing");
    expect(messages[2]).toContain("left the marketplace");
    expect(messages[3]).toContain("already licensed");
    expect(new Set(messages).size).toBe(4);
  });
});

describe("rateListingFailureMessage (US3, FR-013, exhaustive)", () => {
  it("maps the typed rating refusal to a plain-language message (not_found is thrown, never returned, like every other marketplace procedure)", () => {
    const notLicensee = rateListingFailureMessage({ status: "not_licensee" });
    expect(notLicensee).toContain("License this trip first");
  });
});

describe("deactivateListingFailureMessage (contract §3, exhaustive)", () => {
  it("maps the typed deactivation refusal to a plain-language message (not_found is thrown, never returned)", () => {
    const alreadyInactive = deactivateListingFailureMessage({ status: "already_inactive", listingId: "x" });
    expect(alreadyInactive).toContain("already off the marketplace");
  });
});

describe("formatRating / formatShareBps (research D8, contract §6)", () => {
  it("shows an explicit unrated state — never a default score", () => {
    expect(formatRating(null, 0)).toBe("Not yet rated");
    expect(formatRating(null, 3)).toBe("Not yet rated");
  });

  it("renders the server aggregate verbatim to one decimal", () => {
    expect(formatRating(4.5, 12)).toBe("★ 4.5 (12)");
    expect(formatRating(3, 1)).toBe("★ 3.0 (1)");
  });

  it("scales share basis points for display", () => {
    expect(formatShareBps(1_000)).toBe("10%");
    expect(formatShareBps(750)).toBe("7.5%");
  });
});

describe("formatEarnings (spec 014 US1, FR-002/FR-003)", () => {
  it("shows an explicit zero for a never-licensed listing", () => {
    expect(formatEarnings(0, 0, "USD")).toBe("0 licenses · 0.00 USD earned");
  });

  it("singularizes exactly one license", () => {
    expect(formatEarnings(1, 22_500, "USD")).toBe("1 license · 225.00 USD earned");
  });

  it("renders the exact server total verbatim, no rounding beyond the currency's own precision", () => {
    expect(formatEarnings(2, 45_000, "USD")).toBe("2 licenses · 450.00 USD earned");
  });
});

describe("marketplaceErrorMessage (FR-008, transport table)", () => {
  function trpcError(code: string) {
    return new TRPCClientError("boom", {
      result: { error: { data: { code } } },
      // The runtime only reads error.data.code; the cast keeps the fixture lean.
    } as unknown as ConstructorParameters<typeof TRPCClientError>[1]);
  }

  it("maps UNAUTHORIZED to the shared session message", () => {
    expect(marketplaceErrorMessage(trpcError("UNAUTHORIZED"))).toBe(
      "Your session has expired. Please sign in again.",
    );
  });

  it("maps FORBIDDEN / BAD_REQUEST / NOT_FOUND to marketplace wording", () => {
    expect(marketplaceErrorMessage(trpcError("FORBIDDEN"))).toBe(
      "The marketplace requires an agency membership. Sign in with your agency account.",
    );
    expect(marketplaceErrorMessage(trpcError("BAD_REQUEST"))).toBe(
      "The server rejected the request. Check the form values and try again.",
    );
    expect(marketplaceErrorMessage(trpcError("NOT_FOUND"))).toBe(
      "That itinerary or listing is no longer available.",
    );
  });

  it("falls back to the shared network message for everything else", () => {
    expect(marketplaceErrorMessage(new Error("socket hang up"))).toBe(
      "Could not reach the server. Check your connection and try again.",
    );
  });
});
