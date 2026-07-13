// L2 — AnthropicLLM.draftItinerary progress mapping (spec 016, INV-028): the
// real tool-loop message stream (client.beta.messages.toolRunner) must yield
// a progress event per tool_use block, then exactly one terminal result event
// — mirroring FakeLLM's contract (planner.test.ts) so both LLMPort
// implementations satisfy the same wire shape. The Anthropic SDK itself is
// mocked at the module boundary (INV-013: no live provider in tests); only
// the toolRunner message-stream contract is exercised.
import { describe, it, expect, vi } from "vitest";
import type { DraftItineraryRequest, DraftProgressEvent, DraftStep } from "../port.js";

type ToolDef = { name: string; run: (input: unknown) => unknown };
type FakeMessage = {
  usage: { input_tokens: number; output_tokens: number };
  content: Array<{ type: "tool_use"; name: string } | { type: "text"; text: string }>;
};

let toolRunnerBehavior: (opts: { tools: ToolDef[] }) => AsyncGenerator<FakeMessage>;

// vi.mock calls are hoisted above imports by vitest's transform, so this
// intercepts the SDK before ../anthropic.js's own top-level import runs.
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    beta = {
      messages: {
        toolRunner: (opts: { tools: ToolDef[] }) => toolRunnerBehavior(opts),
      },
    };
    messages = { create: vi.fn() };
  }
  return { default: MockAnthropic };
});

const { AnthropicLLM } = await import("../anthropic.js");

async function drainDraft(gen: AsyncGenerator<DraftProgressEvent>) {
  const steps: DraftStep[] = [];
  let result: DraftProgressEvent | undefined;
  for await (const event of gen) {
    if (event.type === "progress") steps.push(event.step);
    else result = event;
  }
  return { steps, result };
}

const REQUEST: DraftItineraryRequest = {
  purpose: "test",
  request: {
    destination: "Paris",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    party: { adults: 2, children: 0 },
    currency: "USD",
    budgets: { accommodationMinor: 35_000, activitiesMinor: 12_000, localTransportMinor: 7_000 },
  },
  tools: {
    searchHotelRates: async () => [],
    searchActivities: async () => [],
    quoteTransfer: async () => [],
    quoteCarRental: async () => [],
  },
};

const usage = { input_tokens: 10, output_tokens: 5 };

describe("AnthropicLLM.draftItinerary — streamed progress (spec 016, INV-028)", () => {
  it("maps each tool_use block to its progress step, in order, then yields the drafted terminal result", async () => {
    toolRunnerBehavior = async function* (opts) {
      yield { usage, content: [{ type: "tool_use", name: "search_hotel_rates" }] };
      yield { usage, content: [{ type: "tool_use", name: "search_activities" }] };
      yield { usage, content: [{ type: "tool_use", name: "quote_transfer" }] };
      yield { usage, content: [{ type: "tool_use", name: "quote_car_rental" }] };
      const submitTool = opts.tools.find((t) => t.name === "submit_itinerary_drafts");
      submitTool?.run({
        drafts: [
          { variant: "balanced", draft: { title: "Paris trip", days: [{ items: [{ port: "hotel", offerId: "h-1" }] }] } },
        ],
      });
      yield { usage, content: [{ type: "tool_use", name: "submit_itinerary_drafts" }] };
    };
    const llm = new AnthropicLLM({ apiKey: "test-key" });
    const { steps, result } = await drainDraft(llm.draftItinerary(REQUEST));
    expect(steps).toEqual(["searchingHotels", "searchingActivities", "quotingTransfer", "quotingCarRental", "assembling"]);
    expect(result).toEqual({
      type: "result",
      result: {
        status: "drafted",
        drafts: [
          { variant: "balanced", draft: { title: "Paris trip", days: [{ items: [{ port: "hotel", offerId: "h-1" }] }] } },
        ],
        usage: { inputTokens: 50, outputTokens: 25 },
      },
    });
  });

  it("yields a no_proposals terminal result when the loop ends without a submit call", async () => {
    toolRunnerBehavior = async function* () {
      yield { usage, content: [{ type: "tool_use", name: "search_hotel_rates" }] };
    };
    const llm = new AnthropicLLM({ apiKey: "test-key" });
    const { steps, result } = await drainDraft(llm.draftItinerary(REQUEST));
    expect(steps).toEqual(["searchingHotels"]);
    expect(result).toEqual({ type: "result", result: { status: "failed", reason: "no_proposals" } });
  });

  it("yields a malformed_output terminal result when the tool loop throws", async () => {
    toolRunnerBehavior = async function* () {
      yield { usage, content: [{ type: "tool_use", name: "search_hotel_rates" }] };
      throw new Error("tool loop exploded");
    };
    const llm = new AnthropicLLM({ apiKey: "test-key" });
    const { steps, result } = await drainDraft(llm.draftItinerary(REQUEST));
    expect(steps).toEqual(["searchingHotels"]);
    expect(result).toEqual({ type: "result", result: { status: "failed", reason: "malformed_output" } });
  });

  it("ignores tool_use blocks for unknown tool names (no progress step, no crash)", async () => {
    toolRunnerBehavior = async function* () {
      yield { usage, content: [{ type: "tool_use", name: "some_future_tool" }] };
      yield { usage, content: [{ type: "text", text: "thinking…" }] };
    };
    const llm = new AnthropicLLM({ apiKey: "test-key" });
    const { steps, result } = await drainDraft(llm.draftItinerary(REQUEST));
    expect(steps).toEqual([]);
    expect(result).toEqual({ type: "result", result: { status: "failed", reason: "no_proposals" } });
  });
});
