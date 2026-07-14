// workspace.groupTravel.* — agent-posted group departures (spec 021,
// contracts/group-travel.md). Thin adapter over @tripforge/marketplace flows
// (marketplace-router precedent): zod parse, session → MarketplaceActor,
// business refusals stay VALUES in the response; TRPCErrors are reserved for
// auth/validation/not-found. Join is agent-initiated only at v0 (spec
// Assumptions D-0021.a) — no public/anonymous procedure exists here.
import { TRPCError } from "@trpc/server";
import {
  browseGroupDepartures,
  cancelGroupDeparture,
  cancelGroupDepartureInputSchema,
  joinGroupDeparture,
  joinGroupDepartureInputSchema,
  postGroupDeparture,
  postGroupDepartureInputSchema,
  type MarketplaceActor,
} from "@tripforge/marketplace";
import { router, agentProcedure } from "../trpc.js";
import type { Container, AgentSessionContext } from "../context.js";

function requireDb(container: Container): NonNullable<Container["db"]> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  return db;
}

function actorOf(session: AgentSessionContext): MarketplaceActor {
  return { agencyId: session.agencyId, userId: session.userId };
}

export const groupTravelRouter = router({
  /** Post a group departure from an owned itinerary (US1, contracts §1). */
  post: agentProcedure
    .input((value) => postGroupDepartureInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await postGroupDeparture(requireDb(ctx.container), actorOf(ctx.session), input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),

  /** Posting agency cancels its own departure (contracts §2). */
  cancel: agentProcedure
    .input((value) => cancelGroupDepartureInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await cancelGroupDeparture(requireDb(ctx.container), actorOf(ctx.session), input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),

  /** Active departures, public projection — cross-tenant by design (contracts §3). */
  browse: agentProcedure.query(({ ctx }) => {
    return browseGroupDepartures(requireDb(ctx.container), actorOf(ctx.session));
  }),

  /** The capacity-conservation claim gate (US2, contracts §4, INV-011). */
  join: agentProcedure
    .input((value) => joinGroupDepartureInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await joinGroupDeparture(requireDb(ctx.container), actorOf(ctx.session), input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),
});
