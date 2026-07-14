// propose_itinerary_edit — the structured-output tool for chat-driven editing
// (spec 020, research.md D4/D6, mirrors submit-itinerary-drafts.ts's
// captured-result pattern). Call exactly once per chat turn with EITHER a
// direct edit, OR 2-3 hotel suggestions, OR neither (a clarifying reply) —
// never both an edit and suggestions in the same call (research.md D3).
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ChatEditProposeSchema, type ChatEditPropose } from "../chat-edit.js";

export function proposeItineraryEditTool(capture: (propose: ChatEditPropose) => void) {
  return betaZodTool({
    name: "propose_itinerary_edit",
    description:
      "Submit your interpretation of the agent's chat message. Call exactly once. " +
      "Set `edit` for a direct add/remove (add: use only an offerId a search tool " +
      "returned this turn; remove: use only an existing item's id). Set `suggestions` " +
      "(2-3 entries) instead of `edit` when the request is about the hotel/stay. " +
      "Leave both `edit` null and `suggestions` empty for anything else, and use " +
      "`reply` to explain what you can help with. This ends the turn.",
    inputSchema: ChatEditProposeSchema,
    run: (propose) => {
      capture(propose);
      return "Interpretation received. Turn complete.";
    },
  });
}
