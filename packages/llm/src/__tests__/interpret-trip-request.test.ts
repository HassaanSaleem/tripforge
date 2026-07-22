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

  it("resolves an accumulated multi-turn transcript, deterministically (spec 035)", async () => {
    const llm = new FakeLLM();
    // packages/api comma-joins a conversation's turns above the LLM boundary
    // (spec 035 research.md D1) — neither turn alone resolves (destination-only
    // vs budget-only), together the joined transcript does.
    const joined = ["Plan a trip to Lisbon", "around EUR 2000 for 4 nights"].join(", ");
    const params = resolved(await llm.interpretTripRequest({ purpose: "test", message: joined }));
    expect(params.destination).toBe("Lisbon");
    expect(params.budgetMajor).toBe(2000);
    expect(params.currency).toBe("EUR");
    expect(params.nights).toBe(4);
    // Determinism (spec 035 SC-004): identical params, zero network.
    const second = resolved(await llm.interpretTripRequest({ purpose: "test", message: joined }));
    expect(second).toEqual(params);
  });

  it("honors a LATER turn's correction to an already-stated field (last-match-wins)", async () => {
    const llm = new FakeLLM();
    // packages/api appends the correction turn to the transcript; a first-match
    // extractor would keep the stale "5 nights" (chat-keyless-adjust-drops-correction).
    const joined = ["Plan a trip to Lisbon for 2, 5 nights, EUR 2000", "actually make it 7 nights instead"].join(", ");
    const params = resolved(await llm.interpretTripRequest({ purpose: "test", message: joined }));
    expect(params.destination).toBe("Lisbon");
    expect(params.nights).toBe(7); // the later "7 nights" overrides the earlier "5 nights"
    expect(params.budgetMajor).toBe(2000);
  });

  it("last-match-wins across budget and party-size corrections too", async () => {
    const llm = new FakeLLM();
    const joined = ["Trip to Rome for 2, EUR 2000", "make it EUR 4000 for 4 people"].join(", ");
    const params = resolved(await llm.interpretTripRequest({ purpose: "test", message: joined }));
    expect(params.budgetMajor).toBe(4000); // later EUR 4000 wins over EUR 2000
    expect(params.currency).toBe("EUR");
    expect(params.adults).toBe(4); // later "for 4 people" wins over "for 2"
  });

  it("recognizes a bare leading city with no 'in'/'to' preposition (chat-keyless-interpreter-grammar)", async () => {
    const llm = new FakeLLM();
    const params = resolved(
      await llm.interpretTripRequest({ purpose: "test", message: "Barcelona, 5 nights, 2 people, around EUR 3000" }),
    );
    expect(params.destination).toBe("Barcelona");
    expect(params.nights).toBe(5);
    expect(params.budgetMajor).toBe(3000);
    expect(params.currency).toBe("EUR");
  });

  it("does NOT mistake a sentence-leading verb for a bare city", async () => {
    const llm = new FakeLLM();
    // "Plan …" leads but is not a place; with no in/to and no budget this stays needsInfo.
    const result = await llm.interpretTripRequest({ purpose: "test", message: "Plan something nice for 2" });
    expect(result.status).toBe("needsInfo");
    if (result.status === "needsInfo") expect(result.reply.toLowerCase()).toContain("destination");
  });

  it("recognizes word-form currencies euros/dollars/pounds (chat-keyless-interpreter-grammar)", async () => {
    const llm = new FakeLLM();
    const euros = resolved(
      await llm.interpretTripRequest({ purpose: "test", message: "Plan a trip to Rome, around 3000 euros for 5 nights" }),
    );
    expect(euros.budgetMajor).toBe(3000);
    expect(euros.currency).toBe("EUR");

    const dollars = resolved(
      await llm.interpretTripRequest({ purpose: "test", message: "Trip to Miami, 2500 dollars, 4 nights" }),
    );
    expect(dollars.currency).toBe("USD");
    expect(dollars.budgetMajor).toBe(2500);

    const pounds = resolved(
      await llm.interpretTripRequest({ purpose: "test", message: "Trip to London, 1800 pounds, 3 nights" }),
    );
    expect(pounds.currency).toBe("GBP");
    expect(pounds.budgetMajor).toBe(1800);
  });

  it("parses a 'k' thousands suffix on a word-form currency (chat-keyless-interpreter-grammar)", async () => {
    const llm = new FakeLLM();
    const params = resolved(
      await llm.interpretTripRequest({ purpose: "test", message: "Trip to Rome, around 3k euros, 5 nights" }),
    );
    expect(params.budgetMajor).toBe(3000);
    expect(params.currency).toBe("EUR");
  });
});
