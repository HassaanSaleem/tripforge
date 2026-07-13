// L1 tests for the planner's pure view logic (spec 008 T006/T011, extended by
// spec 018 for the planner UX redesign): form → trip-request mapping
// (validation refusals + exact minor-unit conversion, SC-004), display
// formatting (research D7), the FR-006/007 failure → message mapping
// (contract §2.3: only these strings ever reach the page), and the spec 018
// presentation-only additions (human labels, destination picker seed data).
import { describe, it, expect } from "vitest";
import { TRPCClientError } from "@trpc/client";
import {
  BUDGET_MODE_LABELS,
  currencyFractionDigits,
  draftErrorMessage,
  draftFailureMessage,
  formatMinorAmount,
  HERO_DESTINATIONS,
  resolveDestinationTreatment,
  toTripRequest,
  TRIP_STYLE_LABELS,
  type PlannerFormValues,
} from "../planner-form.js";

const VALID: PlannerFormValues = {
  destination: "Lisbon",
  checkIn: "2026-09-07",
  checkOut: "2026-09-10",
  adults: "2",
  children: "0",
  tripStyle: "balanced",
  budgetMajor: "2500",
  budgetMode: "hardCap",
  currency: "EUR",
};

function requestOf(values: PlannerFormValues) {
  const mapped = toTripRequest(values);
  if ("error" in mapped) {
    throw new Error(`expected a request, got refusal: ${mapped.error}`);
  }
  return mapped.request;
}

function refusalOf(values: PlannerFormValues): string {
  const mapped = toTripRequest(values);
  if ("request" in mapped) {
    throw new Error("expected a refusal, got a request");
  }
  return mapped.error;
}

describe("toTripRequest mapping (FR-001/FR-009)", () => {
  it("maps valid values to the draft input with exact integer minor units", () => {
    expect(requestOf(VALID)).toEqual({
      destination: "Lisbon",
      checkIn: "2026-09-07",
      checkOut: "2026-09-10",
      party: { adults: 2, children: 0 },
      tripStyle: "balanced",
      budget: { mode: "hardCap", amountMinor: 250_000, currency: "EUR" },
    });
  });

  it("converts fractional major units without float drift (SC-004)", () => {
    // 25.10 * 100 is 2509.999… in IEEE754 — the mapping must still yield 2510.
    const req = requestOf({ ...VALID, budgetMajor: "25.10" });
    expect(req.budget.amountMinor).toBe(2510);
  });

  it("uses the currency's fraction digits for zero-decimal currencies", () => {
    const req = requestOf({ ...VALID, currency: "JPY", budgetMajor: "1000" });
    expect(req.budget.amountMinor).toBe(1000);
    expect(req.budget.currency).toBe("JPY");
  });

  it("trims the destination, uppercases the currency, defaults empty children to 0", () => {
    const req = requestOf({
      ...VALID,
      destination: "  Porto  ",
      currency: "eur",
      children: "",
    });
    expect(req.destination).toBe("Porto");
    expect(req.budget.currency).toBe("EUR");
    expect(req.party.children).toBe(0);
  });

  it("omits tripStyle when unset", () => {
    const req = requestOf({ ...VALID, tripStyle: "" });
    expect("tripStyle" in req).toBe(false);
  });

  it.each<[string, PlannerFormValues]>([
    ["empty destination", { ...VALID, destination: "   " }],
    ["missing dates", { ...VALID, checkOut: "" }],
    ["unordered dates", { ...VALID, checkOut: "2026-09-07" }],
    ["zero adults", { ...VALID, adults: "0" }],
    ["fractional adults", { ...VALID, adults: "1.5" }],
    ["negative children", { ...VALID, children: "-1" }],
    ["zero budget", { ...VALID, budgetMajor: "0" }],
    ["non-numeric budget", { ...VALID, budgetMajor: "lots" }],
    ["bad currency", { ...VALID, currency: "EURO" }],
  ])("refuses %s with a human-readable message", (_name, values) => {
    const message = refusalOf(values);
    expect(message.length).toBeGreaterThan(10);
    expect(message).not.toMatch(/[{}[\]]/);
  });
});

describe("formatMinorAmount (research D7)", () => {
  it("formats two-decimal currencies from exact minor units", () => {
    expect(formatMinorAmount(250_000, "EUR")).toBe("2,500.00 EUR");
    expect(formatMinorAmount(999, "EUR")).toBe("9.99 EUR");
  });

  it("formats zero-decimal currencies without a fraction", () => {
    expect(formatMinorAmount(1000, "JPY")).toBe("1,000 JPY");
  });

  it("resolves fraction digits per currency and falls back to 2", () => {
    expect(currencyFractionDigits("EUR")).toBe(2);
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("not-a-currency")).toBe(2);
  });
});

describe("draftFailureMessage (FR-006) — one distinct human message per typed failure", () => {
  const cases = [
    { status: "infeasible", reason: "budget_below_reserve" },
    { status: "infeasible", reason: "no_days" },
    { status: "planner_failed", reason: "malformed_output" },
    { status: "planner_failed", reason: "no_proposals" },
  ] as const;

  it("maps every business failure to distinct human-readable text", () => {
    const messages = cases.map((outcome) => draftFailureMessage(outcome));
    expect(new Set(messages).size).toBe(cases.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toMatch(/status|reason|[{}]/);
    }
  });
});

describe("draftErrorMessage (FR-007) — transport/authorization failures", () => {
  function trpcError(code: string): unknown {
    return new TRPCClientError("boom", {
      result: {
        error: { code: -32000, message: "boom", data: { code, httpStatus: 400 } },
      },
    } as unknown as ConstructorParameters<typeof TRPCClientError>[1]);
  }

  it("maps UNAUTHORIZED to sign-in guidance", () => {
    expect(draftErrorMessage(trpcError("UNAUTHORIZED"))).toContain("sign in");
  });

  it("maps FORBIDDEN to membership guidance", () => {
    expect(draftErrorMessage(trpcError("FORBIDDEN"))).toContain("agency membership");
  });

  it("maps BAD_REQUEST to form guidance", () => {
    expect(draftErrorMessage(trpcError("BAD_REQUEST"))).toContain("check the form");
  });

  it("maps network/unknown failures to a generic retry message", () => {
    const network = new TRPCClientError("fetch failed");
    const messages = [draftErrorMessage(network), draftErrorMessage(new Error("x")), draftErrorMessage(undefined)];
    for (const message of messages) {
      expect(message).toBe("Could not reach the server. Check your connection and try again.");
    }
  });

  it("never echoes raw error text", () => {
    const leaky = new Error('{"stack":"secret"}');
    expect(draftErrorMessage(leaky)).not.toContain("secret");
  });
});

describe("BUDGET_MODE_LABELS / TRIP_STYLE_LABELS (spec 018 FR-001/002) — no raw enum text", () => {
  const RAW_ENUM_TEXT = ["hardCap", "target", "balanced", "budget", "premium"];

  it("gives every budgetMode value a non-raw-enum label", () => {
    const values: PlannerFormValues["budgetMode"][] = ["hardCap", "target"];
    for (const value of values) {
      const label = BUDGET_MODE_LABELS[value];
      expect(label.length).toBeGreaterThan(0);
      expect(RAW_ENUM_TEXT).not.toContain(label);
    }
  });

  it("gives every non-empty tripStyle value a non-raw-enum label", () => {
    const values: Exclude<PlannerFormValues["tripStyle"], "">[] = ["balanced", "budget", "premium"];
    for (const value of values) {
      const label = TRIP_STYLE_LABELS[value];
      expect(label.length).toBeGreaterThan(0);
      expect(RAW_ENUM_TEXT).not.toContain(label);
    }
  });
});

describe("HERO_DESTINATIONS / resolveDestinationTreatment (spec 018 FR-004, research.md Decision 2/3)", () => {
  it("seeds at least the four spec-required hero destinations", () => {
    const cities = HERO_DESTINATIONS.map((hero) => `${hero.city}, ${hero.country}`);
    expect(cities).toEqual(
      expect.arrayContaining(["Lisbon, Portugal", "Tokyo, Japan", "Marrakech, Morocco", "Reykjavik, Iceland"]),
    );
  });

  it("resolves a treatment for an exact seeded destination string", () => {
    const treatment = resolveDestinationTreatment("Lisbon, Portugal");
    expect(treatment.flag).toBe("🇵🇹");
    expect(treatment.gradient.length).toBeGreaterThan(0);
  });

  it("resolves case-insensitively, including a bare city match", () => {
    expect(resolveDestinationTreatment("lisbon, portugal").flag).toBe("🇵🇹");
    expect(resolveDestinationTreatment("Lisbon").flag).toBe("🇵🇹");
  });

  it("falls back to a default treatment for an unmatched destination, without throwing", () => {
    const treatment = resolveDestinationTreatment("Ljubljana");
    expect(treatment.flag).toBeTruthy();
    expect(treatment.gradient.length).toBeGreaterThan(0);
  });
});
