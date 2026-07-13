// submit_itinerary_drafts — the structured-output tool (research D2, spec
// 019): its zod input schema wraps the named-drafts shape in a top-level
// object (an Anthropic tool's input_schema must itself be an object — a bare
// array is rejected by the SDK), so the SDK validates the model's 1-3 labeled
// options at the tool boundary and feeds violations back for retry. The
// pinned SDK (0.65.0) has no messages.parse structured outputs; this delivers
// the same guarantee — zod-validated, schema-conformant plans — at the same
// layer.
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NamedPlannerDraftsSchema, type NamedPlannerDrafts } from "../planner-draft.js";

const SubmitItineraryDraftsInputSchema = z.strictObject({ drafts: NamedPlannerDraftsSchema });

export function submitItineraryDraftsTool(capture: (drafts: NamedPlannerDrafts) => void) {
  return betaZodTool({
    name: "submit_itinerary_drafts",
    description:
      "Submit the FINAL itinerary options. Call exactly once, after the supply " +
      "lookups, with 1-3 distinct labeled drafts (variant: budgetSavvy | balanced | " +
      "premium — each proposed at most once), each with one entry per trip day and " +
      "only offerIds returned by the lookup tools. This ends the planning session.",
    inputSchema: SubmitItineraryDraftsInputSchema,
    run: ({ drafts }) => {
      capture(drafts);
      return "Drafts received. Planning session complete.";
    },
  });
}
