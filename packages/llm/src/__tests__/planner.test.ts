// L1/L2 — planner boundary (spec 005 FR-006; INV-013): the draft vocabulary is
// zod-enforced at the submit-tool boundary, the tool definitions carry the
// INV-013 names, and the deterministic fake drives the same injected tools the
// real planner would — reproducible with zero network.
import { describe, it, expect } from "vitest";
import type { ActivityOffer, HotelOffer, TransferOffer, CarRentalOffer } from "@tripforge/supply-adapter";

// Money is structural ({ amountMinor, currency }) — literals keep this package
// free of a @tripforge/domain dependency (INV-017 lateral coupling minimized).
const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });
const eur = (amountMinor: number) => ({ amountMinor, currency: "EUR" });
import { FakeLLM } from "../fake.js";
import { PlannerDraftSchema } from "../planner-draft.js";
import type { PlannerToolDeps } from "../port.js";
import { searchHotelRatesTool } from "../tools/search-hotel-rates.js";
import { searchActivitiesTool } from "../tools/search-activities.js";
import { quoteTransferTool } from "../tools/quote-transfer.js";
import { quoteCarRentalTool } from "../tools/quote-car-rental.js";
import { submitItineraryDraftTool } from "../tools/submit-itinerary-draft.js";

const hotels: HotelOffer[] = [
  { offerId: "paris-001", content: { title: "Paris Grand" }, netRate: usd(18_000) },
  { offerId: "paris-002", content: { title: "Paris Boutique" }, netRate: usd(12_500) },
];
const activities: ActivityOffer[] = [
  { offerId: "act-1", content: { title: "Louvre" }, netRate: eur(3_300), durationMinutes: 180 },
  { offerId: "act-2", content: { title: "Seine cruise" }, netRate: eur(4_500) },
];
const transfers: TransferOffer[] = [
  { offerId: "tx-1", content: { title: "Private car" }, netRate: usd(1_900), mode: "private" },
];
const cars: CarRentalOffer[] = [
  { offerId: "car-1", content: { title: "Compact" }, netRate: eur(8_800), vehicleClass: "compact" },
];

function deps(calls: string[]): PlannerToolDeps {
  return {
    searchHotelRates: async () => {
      calls.push("hotel");
      return hotels;
    },
    searchActivities: async () => {
      calls.push("activity");
      return activities;
    },
    quoteTransfer: async () => {
      calls.push("transfer");
      return transfers;
    },
    quoteCarRental: async () => {
      calls.push("car");
      return cars;
    },
  };
}

const REQUEST = {
  destination: "Paris",
  checkIn: "2026-09-01",
  checkOut: "2026-09-03",
  party: { adults: 2, children: 0 },
  currency: "USD",
  budgets: { accommodationMinor: 35_000, activitiesMinor: 12_000, localTransportMinor: 7_000 },
};

describe("FakeLLM.draftItinerary — deterministic planner (INV-019)", () => {
  it("drives all four lookup tools and proposes only returned offerIds", async () => {
    const calls: string[] = [];
    const fake = new FakeLLM();
    const result = await fake.draftItinerary({ purpose: "test", request: REQUEST, tools: deps(calls) });
    expect(result.status).toBe("drafted");
    if (result.status !== "drafted") return;
    // All four tools exercised (car rental is context only — D-006).
    expect([...calls].sort()).toEqual(["activity", "car", "hotel", "transfer"]);
    // 2-night trip → 2 days; day 1 carries transfer + cheapest stay.
    expect(result.draft.days).toHaveLength(2);
    expect(result.draft.days[0]?.items).toContainEqual({ port: "hotel", offerId: "paris-002" });
    expect(result.draft.days[0]?.items).toContainEqual({ port: "transfer", offerId: "tx-1" });
    // No car-rental proposals possible: the vocabulary has no such port.
    const validated = PlannerDraftSchema.parse(result.draft);
    expect(validated.days.every((d) => d.items.every((i) => ["hotel", "activity", "transfer"].includes(i.port)))).toBe(
      true,
    );
  });

  it("is deterministic — same request, same draft", async () => {
    const a = await new FakeLLM().draftItinerary({ purpose: "t", request: REQUEST, tools: deps([]) });
    const b = await new FakeLLM().draftItinerary({ purpose: "t", request: REQUEST, tools: deps([]) });
    expect(a).toEqual(b);
  });

  it("consumes scripted results first (test injection seam)", async () => {
    const scripted = {
      status: "drafted" as const,
      draft: { title: "Scripted", days: [{ items: [{ port: "hotel" as const, offerId: "made-up" }] }] },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    const fake = new FakeLLM({ plannerScripts: [scripted] });
    const result = await fake.draftItinerary({ purpose: "t", request: REQUEST, tools: deps([]) });
    expect(result).toEqual(scripted);
  });

  it("fails typed with no_proposals when supply is empty", async () => {
    const empty: PlannerToolDeps = {
      searchHotelRates: async () => [],
      searchActivities: async () => [],
      quoteTransfer: async () => [],
      quoteCarRental: async () => [],
    };
    const result = await new FakeLLM().draftItinerary({ purpose: "t", request: REQUEST, tools: empty });
    expect(result).toEqual({ status: "failed", reason: "no_proposals" });
  });
});

describe("PlannerDraftSchema — the structured-output gate (research D2)", () => {
  it("rejects malformed drafts (unknown port, missing offerId, empty days)", () => {
    expect(PlannerDraftSchema.safeParse({ title: "x", days: [] }).success).toBe(false);
    expect(
      PlannerDraftSchema.safeParse({ title: "x", days: [{ items: [{ port: "car", offerId: "c1" }] }] }).success,
    ).toBe(false);
    expect(PlannerDraftSchema.safeParse({ title: "x", days: [{ items: [{ port: "hotel" }] }] }).success).toBe(false);
    expect(
      PlannerDraftSchema.safeParse({ title: "", days: [{ items: [{ port: "hotel", offerId: "h1" }] }] }).success,
    ).toBe(false);
    // Unknown extra fields are rejected — no unversioned smuggling.
    expect(
      PlannerDraftSchema.safeParse({
        title: "x",
        days: [{ items: [{ port: "hotel", offerId: "h1", price: 999 }] }],
      }).success,
    ).toBe(false);
  });

  it("accepts a well-formed draft", () => {
    const parsed = PlannerDraftSchema.parse({
      title: "Paris",
      days: [{ items: [{ port: "activity", offerId: "act-1", startsAt: "2026-09-01T10:00:00Z" }] }],
    });
    expect(parsed.days[0]?.items[0]).toEqual({ port: "activity", offerId: "act-1", startsAt: "2026-09-01T10:00:00Z" });
  });
});

describe("tool definitions — INV-013 names + injected executors", () => {
  it("carries the exact INV-013 tool names", () => {
    expect(searchHotelRatesTool(async () => hotels).name).toBe("search_hotel_rates");
    expect(searchActivitiesTool(async () => activities).name).toBe("search_activities");
    expect(quoteTransferTool(async () => transfers).name).toBe("quote_transfer");
    expect(quoteCarRentalTool(async () => cars).name).toBe("quote_car_rental");
    expect(submitItineraryDraftTool(() => undefined).name).toBe("submit_itinerary_draft");
  });

  it("runs the injected executor and serializes supplier-agnostic offers only", async () => {
    const tool = searchHotelRatesTool(async () => hotels);
    const out = await tool.run({ destination: "Paris", checkIn: "2026-09-01", checkOut: "2026-09-03", guests: 2 });
    const parsed = JSON.parse(out as string) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      offerId: "paris-001",
      title: "Paris Grand",
      netAmountMinor: 18_000,
      currency: "USD",
      features: undefined,
    });
  });

  it("submit tool captures the validated draft", async () => {
    let captured: unknown;
    const tool = submitItineraryDraftTool((d) => {
      captured = d;
    });
    const draft = { title: "Paris", days: [{ items: [{ port: "hotel" as const, offerId: "h-1" }] }] };
    await tool.run(draft);
    expect(captured).toEqual(draft);
  });
});
