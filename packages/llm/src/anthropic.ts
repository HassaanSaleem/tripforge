// Production LLMPort implementation — official Anthropic SDK (INV-013). Pinned to
// `claude-haiku-4-5`; the `effort` parameter is never sent (unsupported on Haiku).
// complete() is the plain text path; draftItinerary() (spec 005) drives the
// bounded tool-runner loop: the four supply lookup tools + the structured-output
// submit tool (research D2), every call metered (purpose, model, tokens).
import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL, type LLMPort, type LlmCompleteRequest, type LlmCompleteResponse } from "./port.js";
import type {
  ChatEditProgressEvent,
  ChatEditRequest,
  ChatEditStep,
  DraftItineraryRequest,
  DraftProgressEvent,
  DraftStep,
  InterpretTripRequestRequest,
  LlmUsage,
  PlannerTripRequest,
} from "./port.js";
import type { NamedPlannerDrafts } from "./planner-draft.js";
import type { ChatEditPropose } from "./chat-edit.js";
import type { InterpretTripRequestPropose, InterpretTripRequestResult } from "./interpret-trip-request.js";
import { searchHotelRatesTool } from "./tools/search-hotel-rates.js";
import { searchActivitiesTool } from "./tools/search-activities.js";
import { quoteTransferTool } from "./tools/quote-transfer.js";
import { quoteCarRentalTool } from "./tools/quote-car-rental.js";
import { submitItineraryDraftsTool } from "./tools/submit-itinerary-drafts.js";
import { proposeItineraryEditTool } from "./tools/propose-itinerary-edit.js";
import { interpretTripRequestTool } from "./tools/interpret-trip-request.js";

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
  "You are a travel-agency itinerary planner. Draft 1-3 distinct, labeled day-by-day",
  "trip options using ONLY real, bookable inventory you discover through the lookup tools.",
  "Rules:",
  "- Call search_hotel_rates, search_activities and quote_transfer before proposing.",
  "- quote_car_rental is budget context only; car rentals can never be itinerary items.",
  "- Propose only offerIds the tools returned — never invent one.",
  "- Stay within the per-category budgets you are given; prefer cheaper options when tight.",
  "- Produce up to 3 variants — budgetSavvy (cheaper choices), balanced (your best default",
  "  pick), premium (higher-end choices) — each proposed at most once; skip a variant rather",
  "  than duplicate another one if the inventory can't support a genuinely different plan.",
  "- Finish by calling submit_itinerary_drafts exactly once with every variant you produced,",
  "  each with one entry per trip day.",
].join("\n");

// Maps the planner tool names (INV-013 vocabulary) to the wire-safe progress
// step reported to the caller — never the raw tool_use block (Constitution V).
const TOOL_NAME_TO_STEP: Record<string, DraftStep> = {
  search_hotel_rates: "searchingHotels",
  search_activities: "searchingActivities",
  quote_transfer: "quotingTransfer",
  quote_car_rental: "quotingCarRental",
  submit_itinerary_drafts: "assembling",
};

// Stable chat-edit instructions (spec 020) — kept free of per-request values
// so the prompt prefix stays cacheable (INV-013), mirroring PLANNER_SYSTEM.
const CHAT_EDIT_SYSTEM = [
  "You are a travel-agency itinerary assistant helping refine an ALREADY-SAVED trip",
  "through chat. You will be given the trip's current items (id/kind/title/day) and one",
  "new message from the agent. Resolve it to exactly one of:",
  "- A direct edit: removeItem (use an EXISTING item's id) for a removal request, or",
  "  addItem (call search_activities or quote_transfer first, use ONLY an offerId it",
  "  returned) for a request to add an activity or transfer to a specific day.",
  "- Hotel suggestions: for anything about the hotel/stay (swap, replace, suggest,",
  "  show options), call search_hotel_rates and propose 2-3 offers as `suggestions`",
  "  instead of `edit` — never silently change the hotel yourself.",
  "- A clarifying reply: if the request doesn't map to either of the above, leave `edit`",
  "  null and `suggestions` empty, and explain in `reply` what you can help with.",
  "Never invent an offerId or an item id — only ones the tools or the current itinerary",
  "listing actually gave you. Finish by calling propose_itinerary_edit exactly once.",
].join("\n");

const CHAT_EDIT_TOOL_NAME_TO_STEP: Record<string, ChatEditStep> = {
  search_hotel_rates: "searchingOptions",
  search_activities: "searchingOptions",
  quote_transfer: "searchingOptions",
  propose_itinerary_edit: "searchingOptions",
};

// Stable chat-first interpretation instructions (spec 028) — kept free of
// per-request values so the prompt prefix stays cacheable (INV-013). No
// supply tools are offered here (research.md D2): this call never searches
// inventory, it only maps text to request parameters.
const INTERPRET_TRIP_REQUEST_SYSTEM = [
  "You are a travel-agency assistant turning ONE chat message into a trip-planning",
  "request. Identify a destination and a total budget amount in the message.",
  "If BOTH are present, call interpret_trip_request with `params` filled in — use",
  "sensible defaults for anything else the message doesn't state (2 adults, 0",
  "children, no style preference, 4 nights, EUR currency).",
  "If either a destination or a budget amount is missing, call",
  "interpret_trip_request with `params` null and a `reply` asking for exactly what's",
  "missing. Finish by calling interpret_trip_request exactly once.",
].join("\n");

const INTERPRET_MAX_TOKENS = 1024;

function chatEditUserPrompt(req: ChatEditRequest): string {
  const itemLines = req.items.length
    ? req.items.map((it) => `- ${it.id} (${it.kind}, day ${it.dayNumber}): ${it.title}`).join("\n")
    : "(no items yet)";
  return [
    `Trip: ${req.destination}, ${req.checkIn} to ${req.checkOut}, ${req.party.adults} adult(s) and ${req.party.children} child(ren).`,
    "Current items:",
    itemLines,
    `Agent's message: "${req.message}"`,
  ].join("\n");
}

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

  async *draftItinerary(req: DraftItineraryRequest): AsyncGenerator<DraftProgressEvent> {
    let captured: NamedPlannerDrafts | undefined;
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
        submitItineraryDraftsTool((drafts) => {
          captured = drafts;
        }),
      ],
      // NOTE: no `effort` param — unsupported on Haiku 4.5 (INV-013).
    });

    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    try {
      for await (const message of runner) {
        usage.inputTokens += message.usage.input_tokens;
        usage.outputTokens += message.usage.output_tokens;
        for (const block of message.content) {
          if (block.type === "tool_use") {
            const step = TOOL_NAME_TO_STEP[block.name];
            if (step) {
              yield { type: "progress", step };
            }
          }
        }
      }
    } catch {
      this.onUsage?.({ purpose: req.purpose, model: LLM_MODEL, ...usage });
      yield { type: "result", result: { status: "failed", reason: "malformed_output" } };
      return;
    }
    this.onUsage?.({ purpose: req.purpose, model: LLM_MODEL, ...usage });

    if (!captured) {
      yield { type: "result", result: { status: "failed", reason: "no_proposals" } };
      return;
    }
    yield { type: "result", result: { status: "drafted", drafts: captured, usage } };
  }

  async *chatEditItinerary(req: ChatEditRequest): AsyncGenerator<ChatEditProgressEvent> {
    yield { type: "progress", step: "interpreting" };
    let captured: ChatEditPropose | undefined;
    const runner = this.client.beta.messages.toolRunner({
      model: LLM_MODEL,
      max_tokens: PLANNER_MAX_TOKENS,
      max_iterations: MAX_TOOL_ITERATIONS,
      system: CHAT_EDIT_SYSTEM,
      messages: [{ role: "user", content: chatEditUserPrompt(req) }],
      tools: [
        searchHotelRatesTool((c) => req.tools.searchHotelRates(c)),
        searchActivitiesTool((c) => req.tools.searchActivities(c)),
        quoteTransferTool((c) => req.tools.quoteTransfer(c)),
        proposeItineraryEditTool((propose) => {
          captured = propose;
        }),
      ],
      // NOTE: no `effort` param — unsupported on Haiku 4.5 (INV-013).
    });

    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    try {
      for await (const message of runner) {
        usage.inputTokens += message.usage.input_tokens;
        usage.outputTokens += message.usage.output_tokens;
        for (const block of message.content) {
          if (block.type === "tool_use") {
            const step = CHAT_EDIT_TOOL_NAME_TO_STEP[block.name];
            if (step) {
              yield { type: "progress", step };
            }
          }
        }
      }
    } catch {
      this.onUsage?.({ purpose: req.purpose, model: LLM_MODEL, ...usage });
      yield { type: "result", result: { status: "failed", reason: "malformed_output" } };
      return;
    }
    this.onUsage?.({ purpose: req.purpose, model: LLM_MODEL, ...usage });

    if (!captured) {
      yield { type: "result", result: { status: "failed", reason: "malformed_output" } };
      return;
    }
    yield { type: "result", result: { status: "interpreted", ...captured, usage } };
  }

  /** ONE forced tool call — no runner loop needed (research.md D2): no
   * supply search happens while interpreting a chat-first trip request, so
   * this mirrors complete()'s single-call shape rather than
   * draftItinerary/chatEditItinerary's streamed tool-loop shape. */
  async interpretTripRequest(req: InterpretTripRequestRequest): Promise<InterpretTripRequestResult> {
    let captured: InterpretTripRequestPropose | undefined;
    const runner = this.client.beta.messages.toolRunner({
      model: LLM_MODEL,
      max_tokens: INTERPRET_MAX_TOKENS,
      max_iterations: 1,
      system: INTERPRET_TRIP_REQUEST_SYSTEM,
      messages: [{ role: "user", content: req.message }],
      tool_choice: { type: "tool", name: "interpret_trip_request" },
      tools: [
        interpretTripRequestTool((propose) => {
          captured = propose;
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
      return { status: "failed", reason: "malformed_output" };
    }
    if (!captured.params) {
      return { status: "needsInfo", reply: captured.reply, usage };
    }
    return { status: "resolved", params: captured.params, usage };
  }
}
