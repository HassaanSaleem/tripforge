// L1 — chat-first trip-request interpretation (spec 028 FR-002/FR-004/FR-008;
// research.md D7). FakeLLM.interpretTripRequest is a deterministic regex/
// keyword extractor — reproducible with zero network, matching
// draftItinerary/chatEditItinerary's own guarantee.
import { describe, it, expect } from "vitest";
import { FakeLLM } from "../fake.js";
import type { InterpretTripRequestResult } from "../interpret-trip-request.js";

function resolved(result: InterpretTripRequestResult) {
  if (result.status !== "resolved") throw new Error(`expected resolved, got ${result.status}`);
  return result.params;
}

describe("FakeLLM.interpretTripRequest", () => {
  it("resolves the ticket's own example phrasing", async () => {
    const llm = new FakeLLM();
    const result = await llm.interpretTripRequest({
      purpose: "test",
      message: "Plan 4 days in Lisbon for 2, ~EUR2000, boutique stay",
    });
    const params = resolved(result);
    expect(params.destination).toBe("Lisbon");
    expect(params.nights).toBe(3); // "4 days" -> 3 nights (research.md D7)
    expect(params.adults).toBe(2);
    expect(params.children).toBe(0);
    expect(params.tripStyle).toBe("premium"); // "boutique" keyword
    expect(params.budgetMajor).toBe(2000);
    expect(params.currency).toBe("EUR");
  });

  it("resolves destination + budget only, filling the documented defaults", async () => {
    const llm = new FakeLLM();
    const params = resolved(await llm.interpretTripRequest({ purpose: "test", message: "Trip to Tokyo, budget $3000" }));
    expect(params.destination).toBe("Tokyo");
    expect(params.currency).toBe("USD");
    expect(params.budgetMajor).toBe(3000);
    expect(params.nights).toBe(4); // default (research.md D4)
    expect(params.adults).toBe(2); // default
    expect(params.children).toBe(0); // default
    expect(params.tripStyle).toBeNull(); // no preference stated
  });

  it("resolves amount-before-currency-code phrasing", async () => {
    const llm = new FakeLLM();
    const params = resolved(await llm.interpretTripRequest({ purpose: "test", message: "Plan a trip to Marrakech, 2000 EUR budget" }));
    expect(params.destination).toBe("Marrakech");
    expect(params.budgetMajor).toBe(2000);
    expect(params.currency).toBe("EUR");
  });

  it("extracts a budget style keyword", async () => {
    const llm = new FakeLLM();
    const params = resolved(await llm.interpretTripRequest({ purpose: "test", message: "Cheap trip to Bangkok, $500" }));
    expect(params.tripStyle).toBe("budget");
  });

  it("asks for a destination when none is identifiable", async () => {
    const llm = new FakeLLM();
    const result = await llm.interpretTripRequest({ purpose: "test", message: "Plan a trip for 2 with a EUR 2000 budget" });
    expect(result.status).toBe("needsInfo");
    if (result.status === "needsInfo") {
      expect(result.reply.toLowerCase()).toContain("destination");
    }
  });

  it("asks for a budget when none is identifiable", async () => {
    const llm = new FakeLLM();
    const result = await llm.interpretTripRequest({ purpose: "test", message: "Plan 4 days in Lisbon for 2" });
    expect(result.status).toBe("needsInfo");
    if (result.status === "needsInfo") {
      expect(result.reply.toLowerCase()).toContain("budget");
    }
  });

  it("asks for a destination on an off-topic message", async () => {
    const llm = new FakeLLM();
    const result = await llm.interpretTripRequest({ purpose: "test", message: "what's the weather like today?" });
    expect(result.status).toBe("needsInfo");
  });

  it("is deterministic: repeated calls with the same message produce identical params", async () => {
    const llm = new FakeLLM();
    const message = "Plan 4 days in Lisbon for 2, ~EUR2000, boutique stay";
    const first = resolved(await llm.interpretTripRequest({ purpose: "test", message }));
    const second = resolved(await llm.interpretTripRequest({ purpose: "test", message }));
    expect(second).toEqual(first);
    expect(first.destination).toBe("Lisbon");
  });
});
