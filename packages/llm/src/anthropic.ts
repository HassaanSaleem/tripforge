// Production LLMPort implementation — official Anthropic SDK (INV-013). Pinned to
// `claude-haiku-4-5`; the `effort` parameter is never sent (unsupported on Haiku).
// complete() is the plain text path; draftItinerary() (spec 005) drives the
// bounded tool-runner loop: the four supply lookup tools + the structured-output
// submit tool (research D2), every call metered (purpose, model, tokens).
import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL, type LLMPort, type LlmCompleteRequest, type LlmCompleteResponse } from "./port.js";
import type { DraftItineraryRequest, DraftItineraryResult, LlmUsage, PlannerTripRequest } from "./port.js";
import type { PlannerDraft } from "./planner-draft.js";
import { searchHotelRatesTool } from "./tools/search-hotel-rates.js";
import { searchActivitiesTool } from "./tools/search-activities.js";
import { quoteTransferTool } from "./tools/quote-transfer.js";
import { quoteCarRentalTool } from "./tools/quote-car-rental.js";
import { submitItineraryDraftTool } from "./tools/submit-itinerary-draft.js";

export interface AnthropicLLMOptions {
  apiKey: string;
  /** Metering hook — every call reports its usage + purpose (INV-013). */
  onUsage?: (record: { purpose: string; model: string; inputTokens: number; outputTokens: number }) => void;
}

// Bounded loop: search fan-out fits comfortably in a handful of turns; the cap
// keeps the request inside serverless timeouts (INV-028, plan Complexity item).
const MAX_TOOL_ITERATIONS = 6;
const PLANNER_MAX_TOKENS = 4096;

// Stable planner instructions (kept free of per-request values so the prompt
// prefix stays cacheable — INV-013 prompt-caching note).
const PLANNER_SYSTEM = [
  "You are a travel-agency itinerary planner. Draft a realistic day-by-day trip",
  "using ONLY real, bookable inventory you discover through the lookup tools.",
  "Rules:",
  "- Call search_hotel_rates, search_activities and quote_transfer before proposing.",
  "- quote_car_rental is budget context only; car rentals can never be itinerary items.",
  "- Propose only offerIds the tools returned — never invent one.",
  "- Stay within the per-category budgets you are given; prefer cheaper options when tight.",
  "- Finish by calling submit_itinerary_draft exactly once with one entry per trip day.",
].join("\n");

function plannerUserPrompt(request: PlannerTripRequest): string {
  return [
    `Draft a trip to ${request.destination}, ${request.checkIn} to ${request.checkOut},`,
    `for ${request.party.adults} adult(s) and ${request.party.children} child(ren).`,
    `Style: ${request.tripStyle ?? "balanced"}. Itinerary currency: ${request.currency}.`,
    `Spendable budgets (minor units of ${request.currency}):`,
    `accommodation ${request.budgets.accommodationMinor},`,
    `activities ${request.budgets.activitiesMinor},`,
    `local transport/transfers ${request.budgets.localTransportMinor}.`,
  ].join(" ");
}

export class AnthropicLLM implements LLMPort {
  private readonly client: Anthropic;
  private readonly onUsage?: AnthropicLLMOptions["onUsage"];

  constructor(options: AnthropicLLMOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.onUsage = options.onUsage;
  }

  async complete(req: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    const message = await this.client.messages.create({
      model: LLM_MODEL,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      // NOTE: no `effort` param — unsupported on Haiku 4.5 (INV-013).
    });

    const text = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    const usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
    this.onUsage?.({ purpose: req.purpose, model: LLM_MODEL, ...usage });

    return { text, model: LLM_MODEL, usage };
  }

  async draftItinerary(req: DraftItineraryRequest): Promise<DraftItineraryResult> {
    let captured: PlannerDraft | undefined;
    const runner = this.client.beta.messages.toolRunner({
      model: LLM_MODEL,
      max_tokens: PLANNER_MAX_TOKENS,
      max_iterations: MAX_TOOL_ITERATIONS,
      system: PLANNER_SYSTEM,
      messages: [{ role: "user", content: plannerUserPrompt(req.request) }],
      tools: [
        searchHotelRatesTool((c) => req.tools.searchHotelRates(c)),
        searchActivitiesTool((c) => req.tools.searchActivities(c)),
        quoteTransferTool((c) => req.tools.quoteTransfer(c)),
        quoteCarRentalTool((c) => req.tools.quoteCarRental(c)),
        submitItineraryDraftTool((draft) => {
          captured = draft;
        }),
      ],
      // NOTE: no `effort` param — unsupported on Haiku 4.5 (INV-013).
    });

    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    try {
      for await (const message of runner) {
        usage.inputTokens += message.usage.input_tokens;
        usage.outputTokens += message.usage.output_tokens;
      }
    } catch {
      this.onUsage?.({ purpose: req.purpose, model: LLM_MODEL, ...usage });
      return { status: "failed", reason: "malformed_output" };
    }
    this.onUsage?.({ purpose: req.purpose, model: LLM_MODEL, ...usage });

    if (!captured) {
      return { status: "failed", reason: "no_proposals" };
    }
    return { status: "drafted", draft: captured, usage };
  }
}
