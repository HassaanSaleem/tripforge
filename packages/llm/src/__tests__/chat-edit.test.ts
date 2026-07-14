// L1/L2 — chat-driven itinerary editing (spec 020 FR-002/FR-008/FR-011;
// research.md D3/D7). FakeLLM.chatEditItinerary is a deterministic keyword-
// rule interpreter over the SAME injected PlannerToolDeps the planner uses —
// reproducible with zero network, matching draftItinerary's own guarantee.
import { describe, it, expect } from "vitest";
import type { ActivityOffer, HotelOffer, TransferOffer, CarRentalOffer } from "@tripforge/supply-adapter";
import { FakeLLM } from "../fake.js";
import { ChatEditProposeSchema } from "../chat-edit.js";
import { proposeItineraryEditTool } from "../tools/propose-itinerary-edit.js";
import type { ChatEditProgressEvent, ChatEditRequest, ChatEditResult, ChatEditStep, PlannerToolDeps } from "../port.js";

const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });

const hotels: HotelOffer[] = [
  { offerId: "paris-001", content: { title: "Paris Grand" }, netRate: usd(18_000) },
  { offerId: "paris-002", content: { title: "Paris Boutique" }, netRate: usd(12_500) },
];
const activities: ActivityOffer[] = [
  { offerId: "act-1", content: { title: "Louvre" }, netRate: usd(3_300), durationMinutes: 180 },
  { offerId: "act-2", content: { title: "Food tour" }, netRate: usd(4_500) },
];
const transfers: TransferOffer[] = [{ offerId: "tx-1", content: { title: "Private car" }, netRate: usd(1_900), mode: "private" }];
const cars: CarRentalOffer[] = [];

function deps(): PlannerToolDeps {
  return {
    searchHotelRates: async () => hotels,
    searchActivities: async () => activities,
    quoteTransfer: async () => transfers,
    quoteCarRental: async (): Promise<CarRentalOffer[]> => cars,
  };
}

const BASE_ITEMS: ChatEditRequest["items"] = [
  { id: "d1-i1", kind: "transfer", title: "Private car", dayNumber: 1 },
  { id: "d1-i2", kind: "stay", title: "Paris Boutique", dayNumber: 1 },
  { id: "d1-i3", kind: "activity", title: "Louvre", dayNumber: 1 },
  { id: "d2-i1", kind: "activity", title: "Louvre", dayNumber: 2 },
];

function request(message: string, items = BASE_ITEMS): ChatEditRequest {
  return {
    purpose: "test",
    message,
    destination: "Paris",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    party: { adults: 2, children: 0 },
    items,
    tools: deps(),
  };
}

async function drain(gen: AsyncGenerator<ChatEditProgressEvent>): Promise<{ steps: ChatEditStep[]; result: ChatEditResult }> {
  const steps: ChatEditStep[] = [];
  let result: ChatEditResult | undefined;
  for await (const event of gen) {
    if (event.type === "progress") steps.push(event.step);
    else result = event.result;
  }
  if (!result) throw new Error("chatEditItinerary ended without a terminal result event");
  return { steps, result };
}

describe("FakeLLM.chatEditItinerary — direct add/remove (US1)", () => {
  it('resolves "add a food tour on day 2" to an activity addItem on day 2', async () => {
    const { result } = await drain(new FakeLLM().chatEditItinerary(request("add a food tour on day 2")));
    expect(result.status).toBe("interpreted");
    if (result.status !== "interpreted") return;
    expect(result.edit).toEqual({ type: "addItem", dayNumber: 2, port: "activity", offerId: "act-2" });
    expect(result.suggestions).toEqual([]);
  });

  it('resolves "remove the Louvre" to a removeItem targeting an existing id', async () => {
    const { result } = await drain(new FakeLLM().chatEditItinerary(request("remove the Louvre")));
    expect(result.status).toBe("interpreted");
    if (result.status !== "interpreted") return;
    expect(result.edit?.type).toBe("removeItem");
    if (result.edit?.type !== "removeItem") return;
    expect(BASE_ITEMS.some((i) => i.id === result.edit?.itemId && i.title === "Louvre")).toBe(true);
  });

  it("a removal request that matches nothing yields a clarifying reply, no edit", async () => {
    const { result } = await drain(new FakeLLM().chatEditItinerary(request("remove the nonexistent skydiving trip")));
    expect(result.status).toBe("interpreted");
    if (result.status !== "interpreted") return;
    expect(result.edit).toBeNull();
    expect(result.suggestions).toEqual([]);
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it("an out-of-range day number is refused with a clarifying reply, no edit", async () => {
    const { result } = await drain(new FakeLLM().chatEditItinerary(request("add an activity on day 9")));
    expect(result.status).toBe("interpreted");
    if (result.status !== "interpreted") return;
    expect(result.edit).toBeNull();
  });
});

describe("FakeLLM.chatEditItinerary — hotel suggestions (US2)", () => {
  it('resolves "swap the hotel for something boutique near the water" to suggestions, never a direct edit', async () => {
    const { result } = await drain(new FakeLLM().chatEditItinerary(request("swap the hotel for something boutique near the water")));
    expect(result.status).toBe("interpreted");
    if (result.status !== "interpreted") return;
    expect(result.edit).toBeNull();
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('resolves "suggest a hotel" to suggestions excluding the current stay', async () => {
    const { result } = await drain(new FakeLLM().chatEditItinerary(request("suggest a hotel")));
    expect(result.status).toBe("interpreted");
    if (result.status !== "interpreted") return;
    expect(result.suggestions.every((s) => s.title !== "Paris Boutique")).toBe(true);
  });

  it("ChatEditProposeSchema validates a well-formed suggestions payload", () => {
    const parsed = ChatEditProposeSchema.safeParse({
      reply: "Here are a few options",
      edit: null,
      suggestions: [{ offerId: "paris-001", title: "Paris Grand", priceMinor: 18_000, currency: "USD" }],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("FakeLLM.chatEditItinerary — unsupported requests (edge cases)", () => {
  it("an off-topic/unsupported message yields edit: null, suggestions: [] and an explanatory reply", async () => {
    const { result } = await drain(new FakeLLM().chatEditItinerary(request("make day 3 cheaper")));
    expect(result.status).toBe("interpreted");
    if (result.status !== "interpreted") return;
    expect(result.edit).toBeNull();
    expect(result.suggestions).toEqual([]);
    expect(result.reply.length).toBeGreaterThan(0);
  });
});

describe("FakeLLM.chatEditItinerary — determinism (US4, keyless demo)", () => {
  it("is deterministic — same request, same itinerary state, same outcome", async () => {
    const a = await drain(new FakeLLM().chatEditItinerary(request("add a food tour on day 2")));
    const b = await drain(new FakeLLM().chatEditItinerary(request("add a food tour on day 2")));
    expect(a.result).toEqual(b.result);
  });

  it("is deterministic for hotel-suggestion requests too", async () => {
    const a = await drain(new FakeLLM().chatEditItinerary(request("suggest a hotel")));
    const b = await drain(new FakeLLM().chatEditItinerary(request("suggest a hotel")));
    expect(a.result).toEqual(b.result);
  });
});

describe("propose_itinerary_edit tool — INV-013 name + captured result", () => {
  it("carries the exact tool name and captures the validated propose payload", async () => {
    let captured: unknown;
    const tool = proposeItineraryEditTool((p) => {
      captured = p;
    });
    expect(tool.name).toBe("propose_itinerary_edit");
    const propose = { reply: "Removed it", edit: { type: "removeItem" as const, itemId: "d1-i1" }, suggestions: [] };
    await tool.run(propose);
    expect(captured).toEqual(propose);
  });
});
