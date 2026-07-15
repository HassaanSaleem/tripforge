// Chat-first trip-request interpretation vocabulary (spec 028) — the LLMPort
// boundary vocabulary for mapping ONE natural-language chat message to the
// same parameter set the structured form already collects. Mirrors
// chat-edit.ts's "propose, validated, at the boundary" discipline. This is a
// single-shot text-to-scalars mapping — no supply/offer shape ever crosses
// here (INV-005), and no date arithmetic happens here either (research.md
// D3): `nights` is a duration, not a resolved date, kept out of the LLM
// boundary so FakeLLM never needs a wall-clock read to stay deterministic.
import { z } from "zod";
import type { LlmUsage } from "./usage.js";

export const InterpretedTripParamsSchema = z.strictObject({
  destination: z.string().min(1).describe("The trip destination named in the message"),
  nights: z.number().int().min(1).max(30).describe("Trip length in nights"),
  adults: z.number().int().min(1).describe("Number of adult travelers"),
  children: z.number().int().min(0).describe("Number of child travelers"),
  tripStyle: z.enum(["balanced", "budget", "premium"]).nullable().describe("Trip style, or null if unstated"),
  budgetMajor: z.number().positive().describe("Total budget in major currency units (e.g. 2000 for EUR 2000)"),
  currency: z.string().length(3).describe("3-letter ISO currency code"),
});
export type InterpretedTripParams = z.infer<typeof InterpretedTripParamsSchema>;

export const InterpretTripRequestProposeSchema = z.strictObject({
  reply: z
    .string()
    .min(1)
    .describe("Human-readable confirmation, or a clarifying question when info is missing"),
  params: InterpretedTripParamsSchema.nullable().describe(
    "Set when the message resolves to a full trip request (destination + budget identified); null when more info is needed",
  ),
});
export type InterpretTripRequestPropose = z.infer<typeof InterpretTripRequestProposeSchema>;

/** Interpretation result: `params` set only when the message resolved to a
 * full request; `needsInfo` when either destination or budget could not be
 * identified (spec 028 FR-004) — mutually exclusive by construction. */
export type InterpretTripRequestResult =
  | { status: "resolved"; params: InterpretedTripParams; usage: LlmUsage }
  | { status: "needsInfo"; reply: string; usage: LlmUsage }
  | { status: "failed"; reason: "malformed_output" };
