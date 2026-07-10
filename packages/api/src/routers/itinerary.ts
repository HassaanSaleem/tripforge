// workspace.itinerary.* — agent-gated draft + read procedures (contracts §1–2).
// Inputs are zod parse FUNCTIONS (research D3) so nothing depends on
// @trpc/server's schema-spec support level. Business failures come back as
// typed values; NOT_FOUND covers cross-tenant probes (no existence oracle).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, agentProcedure } from "../trpc.js";
import { draftItinerary, tripRequestSchema } from "../services/planner.js";
import { itineraryOverview } from "../services/booking.js";
import { listItineraries } from "../services/itineraries.js";
import { createShareLink, shareInputSchema } from "../services/client-view.js";

const getInputSchema = z.strictObject({ itineraryId: z.uuid() });

export const itineraryRouter = router({
  /** Describe a trip, get a persisted, budget-fit, live-priced draft (US1). */
  draft: agentProcedure
    .input((value) => tripRequestSchema.parse(value))
    .mutation(({ ctx, input }) => draftItinerary(ctx.container, ctx.session, input)),

  /** The agency's own itineraries, newest first — the marketplace listing
   * picker's projection (spec 011 contract §2, INV-004 tenant-scoped). */
  list: agentProcedure.query(({ ctx }) => listItineraries(ctx.container, ctx.session)),

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

  /** Mint (or return) THE durable client-view share link (spec 010 contract §1).
   * Idempotent per itinerary; cross-tenant probes are NOT_FOUND (no oracle). */
  share: agentProcedure
    .input((value) => shareInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await createShareLink(ctx.container, ctx.session, input.itineraryId);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),
});
