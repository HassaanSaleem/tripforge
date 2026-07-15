// interpret_trip_request — the structured-output tool for chat-first entry
// (spec 028, research.md D2, mirrors propose-itinerary-edit.ts's
// captured-result pattern). Called exactly once per message with EITHER a
// resolved `params` (destination + budget both identified) OR null (a
// clarifying reply) — never a partial/malformed params object.
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { InterpretTripRequestProposeSchema, type InterpretTripRequestPropose } from "../interpret-trip-request.js";

export function interpretTripRequestTool(capture: (propose: InterpretTripRequestPropose) => void) {
  return betaZodTool({
    name: "interpret_trip_request",
    description:
      "Submit your interpretation of the agent's chat message. Call exactly once. " +
      "Set `params` when you can identify BOTH a destination and a budget amount " +
      "in the message — fill any other field the message doesn't state with a " +
      "sensible default (2 adults, 0 children, no style preference, 4 nights, " +
      "EUR currency). Leave `params` null when a destination or a budget amount " +
      "is missing, and use `reply` to ask for exactly what's missing. This ends the turn.",
    inputSchema: InterpretTripRequestProposeSchema,
    run: (propose) => {
      capture(propose);
      return "Interpretation received. Turn complete.";
    },
  });
}
