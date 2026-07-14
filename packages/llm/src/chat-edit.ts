// Chat-driven itinerary editing vocabulary (spec 020) — the LLMPort boundary
// vocabulary for interpreting one conversational edit request. Mirrors
// planner-draft.ts's "proposal only, never pricing/provenance" discipline
// (INV-001): a ChatEditProposal references an offer by port+offerId, never a
// supplier payload shape (INV-005). Zod-validated (v4) at the propose-tool
// boundary, same pattern as PlannerDraftSchema.
import { z } from "zod";
import type { LlmUsage } from "./usage.js";

export const ChatEditProposalSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("removeItem"),
    itemId: z.string().min(1).describe("id of an existing item in the current itinerary"),
  }),
  z.strictObject({
    type: z.literal("addItem"),
    dayNumber: z.number().int().min(1).describe("1-based day number already present in the trip"),
    port: z.enum(["hotel", "activity", "transfer"]),
    offerId: z.string().min(1).describe("offerId returned by a search tool this turn"),
    startsAt: z.string().optional().describe("ISO datetime start hint (activities only)"),
  }),
]);
export type ChatEditProposal = z.infer<typeof ChatEditProposalSchema>;

export const HotelSuggestionSchema = z.strictObject({
  offerId: z.string().min(1),
  title: z.string().min(1),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
export type HotelSuggestion = z.infer<typeof HotelSuggestionSchema>;

export const ChatEditProposeSchema = z.strictObject({
  reply: z.string().min(1).describe("Human-readable confirmation or clarification shown to the agent"),
  edit: ChatEditProposalSchema.nullable().describe("Set for a direct add/remove; null for a hotel-suggestion or clarifying reply"),
  suggestions: z
    .array(HotelSuggestionSchema)
    .max(3)
    .describe("2-3 hotel options when the request is about the stay; empty otherwise"),
});
export type ChatEditPropose = z.infer<typeof ChatEditProposeSchema>;

/** Interpretation result: `edit` is set only for a direct add/remove;
 * `suggestions` is non-empty only for a hotel request — mutually exclusive
 * by construction (research.md D3). Both empty is the clarifying/unsupported
 * reply case (spec 020 FR-008). */
export type ChatEditResult =
  | ({ status: "interpreted"; usage: LlmUsage } & ChatEditPropose)
  | { status: "failed"; reason: "malformed_output" };
