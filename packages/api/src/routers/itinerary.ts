// workspace.itinerary.* — agent-gated draft + read procedures (contracts §1–2).
// Inputs are zod parse FUNCTIONS (research D3) so nothing depends on
// @trpc/server's schema-spec support level. Business failures come back as
// typed values; NOT_FOUND covers cross-tenant probes (no existence oracle).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, agentProcedure } from "../trpc.js";
import { draftItinerary, tripRequestSchema } from "../services/planner.js";
import { itineraryOverview } from "../services/booking.js";
import { attachMedia, detachMedia, listItineraries } from "../services/itineraries.js";
import { createShareLink, shareInputSchema } from "../services/client-view.js";

const getInputSchema = z.strictObject({ itineraryId: z.uuid() });

// Discriminated attach/detach target — the itinerary gallery or one specific
// item (spec 015 contracts §4-5).
const mediaTargetSchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("gallery") }),
  z.strictObject({ scope: z.literal("item"), itemId: z.string().min(1) }),
]);

const attachMediaInputSchema = z.strictObject({
  itineraryId: z.uuid(),
  mediaAssetId: z.uuid(),
  target: mediaTargetSchema,
});

const detachMediaInputSchema = z.strictObject({
  itineraryId: z.uuid(),
  mediaRefId: z.uuid(), // = the underlying media asset's library id (research D4)
  target: mediaTargetSchema,
});

export const itineraryRouter = router({
  /** Describe a trip, get a persisted, budget-fit, live-priced draft (US1).
   * Streamed (INV-028, spec 016): the LLM tool loop can take several
   * round trips, so this is an SSE subscription — progress events followed
   * by exactly one terminal result event — rather than a blocking mutation. */
  draft: agentProcedure
    .input((value) => tripRequestSchema.parse(value))
    .subscription(({ ctx, input }) => draftItinerary(ctx.container, ctx.session, input)),

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

  /** Attach a library media asset to the gallery or a specific item (spec 015
   * contracts §4). Cross-tenant itinerary/media and unknown ids are NOT_FOUND
   * (no oracle); an unknown item id under target.scope==="item" is a typed
   * `item_not_found` outcome, not a thrown error (the itinerary itself was found). */
  attachMedia: agentProcedure
    .input((value) => attachMediaInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await attachMedia(ctx.container, ctx.session, input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),

  /** Detach a media ref from the gallery or a specific item (spec 015 contracts
   * §5). Idempotent: detaching an absent ref still returns "detached". */
  detachMedia: agentProcedure
    .input((value) => detachMediaInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await detachMedia(ctx.container, ctx.session, input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),
});
