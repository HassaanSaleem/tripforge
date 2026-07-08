// submit_itinerary_draft — the structured-output tool (research D2): its zod
// input schema IS the planner draft shape, so the SDK validates the model's
// draft at the tool boundary and feeds violations back for retry. The pinned
// SDK (0.65.0) has no messages.parse structured outputs; this delivers the
// same guarantee — zod-validated, schema-conformant plans — at the same layer.
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { PlannerDraftSchema, type PlannerDraft } from "../planner-draft.js";

export function submitItineraryDraftTool(capture: (draft: PlannerDraft) => void) {
  return betaZodTool({
    name: "submit_itinerary_draft",
    description:
      "Submit the FINAL itinerary draft. Call exactly once, after the supply " +
      "lookups, with one entry per trip day and only offerIds returned by the " +
      "lookup tools. This ends the planning session.",
    inputSchema: PlannerDraftSchema,
    run: (draft) => {
      capture(draft);
      return "Draft received. Planning session complete.";
    },
  });
}
