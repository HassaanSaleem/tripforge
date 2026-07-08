// workspace.itinerary.* — agent-gated draft + read procedures (contracts §1–2).
// Inputs are zod parse FUNCTIONS (research D3) so nothing depends on
// @trpc/server's schema-spec support level. Business failures come back as
// typed values; NOT_FOUND covers cross-tenant probes (no existence oracle).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, agentProcedure } from "../trpc.js";
import { draftItinerary, tripRequestSchema } from "../services/planner.js";
import { itineraryOverview } from "../services/booking.js";

const getInputSchema = z.strictObject({ itineraryId: z.uuid() });

export const itineraryRouter = router({
  /** Describe a trip, get a persisted, budget-fit, live-priced draft (US1). */
  draft: agentProcedure
    .input((value) => tripRequestSchema.parse(value))
    .mutation(({ ctx, input }) => draftItinerary(ctx.container, ctx.session, input)),

  /** Canonical document + trip request + quote/booking summaries. */
  get: agentProcedure
    .input((value) => getInputSchema.parse(value))
    .query(async ({ ctx, input }) => {
      const result = await itineraryOverview(ctx.container, ctx.session, input.itineraryId);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),
});
