// LLMPort — the ONLY boundary through which LLM calls may pass (INV-013). Backed by
// the official Anthropic SDK in production; deterministic fakes in tests. Every call
// is metered (tokens, purpose, model).
//
// Model policy: ALL calls run on `claude-haiku-4-5` — no Opus-tier models (operator
// decision 2026-07-03). The model is a pinned type so a non-Haiku model is a compile
// error, not a runtime surprise. Haiku 4.5 does NOT support the `effort` parameter —
// it is intentionally absent from this interface.
import type {
  ActivityOffer,
  ActivitySearchCriteria,
  CarRentalOffer,
  CarRentalSearchCriteria,
  HotelOffer,
  HotelSearchCriteria,
  TransferOffer,
  TransferSearchCriteria,
} from "@tripforge/supply-adapter";
import type { NamedPlannerDraft } from "./planner-draft.js";

/** The single allowed model. Widening this is an operator decision (INV-013). */
export const LLM_MODEL = "claude-haiku-4-5" as const;
export type LlmModel = typeof LLM_MODEL;

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmCompleteRequest {
  /** Why this call is being made — recorded in metering (INV-013). */
  purpose: string;
  system?: string;
  messages: LlmMessage[];
  maxTokens: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCompleteResponse {
  text: string;
  model: LlmModel;
  usage: LlmUsage;
}

// ─── Planner drafting (spec 005, INV-013/014) ────────────────────────────────
// The planner's supply lookups are injected as EXECUTORS closing over the
// composition root's ports (research D7): packages/llm never constructs an
// adapter and its coupling to @tripforge/supply-adapter is type-only — the
// port contract types are the only vocabulary that crosses the boundary
// (INV-005; no supplier API shape).

export interface PlannerToolDeps {
  searchHotelRates(criteria: HotelSearchCriteria): Promise<HotelOffer[]>;
  searchActivities(criteria: ActivitySearchCriteria): Promise<ActivityOffer[]>;
  quoteTransfer(criteria: TransferSearchCriteria): Promise<TransferOffer[]>;
  quoteCarRental(criteria: CarRentalSearchCriteria): Promise<CarRentalOffer[]>;
}

export interface PlannerTripRequest {
  destination: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  party: { adults: number; children: number };
  tripStyle?: string;
  /** Itinerary currency — offers may be priced in other currencies; the
   * deterministic assembler converts explicitly (the planner only proposes). */
  currency: string;
  /** Spendable per category in minor units of `currency` (the flights reserve
   * is excluded — it is the anchor, not a spend category). */
  budgets: {
    accommodationMinor: number;
    activitiesMinor: number;
    localTransportMinor: number;
  };
}

export interface DraftItineraryRequest {
  /** Why this call is being made — recorded in metering (INV-013). */
  purpose: string;
  request: PlannerTripRequest;
  tools: PlannerToolDeps;
}

export type DraftItineraryResult =
  | { status: "drafted"; drafts: NamedPlannerDraft[]; usage: LlmUsage }
  | { status: "failed"; reason: "malformed_output" | "no_proposals" };

// ─── Draft progress streaming (INV-028, spec 016) ────────────────────────────
// Any request handler that calls the LLM tool loop MUST stream so it stays
// within the platform function timeout. draftItinerary() therefore yields
// step-level progress as each supply lookup runs, then a single terminal
// result event — never raw tool-call payloads (Constitution V: no
// supplier-shaped data crosses a package boundary).
export type DraftStep = "searchingHotels" | "searchingActivities" | "quotingTransfer" | "quotingCarRental" | "assembling";

export type DraftProgressEvent =
  | { type: "progress"; step: DraftStep }
  | { type: "result"; result: DraftItineraryResult };

export interface LLMPort {
  complete(req: LlmCompleteRequest): Promise<LlmCompleteResponse>;
  /** Draft 1-3 labeled trip options through tool-driven supply lookups (spec
   * 019). Proposals only — every price in the final itinerary is re-read from
   * supply by the caller. Yields zero or more progress events followed by
   * exactly one terminal result event carrying every variant produced. */
  draftItinerary(req: DraftItineraryRequest): AsyncGenerator<DraftProgressEvent>;
}
