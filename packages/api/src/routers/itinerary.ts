// workspace.itinerary.* — agent-gated draft + read procedures (contracts §1–2).
// Inputs are zod parse FUNCTIONS (research D3) so nothing depends on
// @trpc/server's schema-spec support level. Business failures come back as
// typed values; NOT_FOUND covers cross-tenant probes (no existence oracle).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ChatEditProposalSchema } from "@tripforge/llm";
import { router, agentProcedure } from "../trpc.js";
import { draftOptions, selectDraftInputSchema, selectDraftOption, tripRequestSchema } from "../services/planner.js";
import { itineraryOverview } from "../services/booking.js";
import { applyChatEdit, attachMedia, detachMedia, interpretChatEdit, listItineraries } from "../services/itineraries.js";
import { createShareLink, shareInputSchema } from "../services/client-view.js";

const getInputSchema = z.strictObject({ itineraryId: z.uuid() });

// Discriminated attach/detach target — the itinerary gallery or one specific
// item (spec 015 contracts §4-5).
const mediaTargetSchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("gallery") }),
  z.strictObject({ scope: z.literal("item"), itemId: z.string().min(1) }),
]);

const chatEditInputSchema = z.strictObject({ itineraryId: z.uuid(), message: z.string().min(1) });

const applyChatEditInputSchema = z.strictObject({ itineraryId: z.uuid(), edit: ChatEditProposalSchema });

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
  /** Describe a trip, get 1-3 comparable, budget-fit, live-priced options
   * (spec 019 US1). NOT persisted — see `selectDraft` for that. Streamed
   * (INV-028, spec 016): the LLM tool loop can take several round trips, so
   * this is an SSE subscription — progress events followed by exactly one
   * terminal result event — rather than a blocking mutation. */
  draft: agentProcedure
    .input((value) => tripRequestSchema.parse(value))
    .subscription(({ ctx, input }) => draftOptions(ctx.container, ctx.session, input)),

  /** Persist exactly the option the agent picked from `draft`'s compare view
   * (spec 019 US2). Re-runs the same pipeline (fresh supply verification,
   * FR-008) rather than trusting client-echoed content (FR-012) — streamed
   * for the same reason `draft` is (INV-028). */
  selectDraft: agentProcedure
    .input((value) => selectDraftInputSchema.parse(value))
    .subscription(({ ctx, input }) => selectDraftOption(ctx.container, ctx.session, input)),

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

  /** Interpret one chat message against an already-persisted itinerary (spec
   * 020 contracts/chat-edit-subscription.md). Streamed (INV-028): may run an
   * LLM tool loop to resolve a direct add/remove or hotel suggestions. A
   * cross-tenant/unknown itineraryId yields a typed not_found outcome (no
   * oracle), never a thrown error, so the client always gets a terminal event. */
  chatEdit: agentProcedure
    .input((value) => chatEditInputSchema.parse(value))
    .subscription(({ ctx, input }) => interpretChatEdit(ctx.container, ctx.session, input)),

  /** Apply an already-resolved edit directly, with no LLM call (spec 020
   * contracts/apply-chat-edit-mutation.md) — the suggestion card's "Add to
   * trip" action. The offer is re-verified server-side, never trusted from
   * the client's suggestion-card copy (FR-006/FR-012). */
  applyChatEdit: agentProcedure
    .input((value) => applyChatEditInputSchema.parse(value))
    .mutation(({ ctx, input }) => applyChatEdit(ctx.container, ctx.session, input)),

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
