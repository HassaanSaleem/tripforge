// workspace.tripHandoffs.* — the agent-side "Trip requests" inbox (spec 022,
// contracts/request-agent-fork.md §2/§3). Thin adapter over
// services/trip-handoffs.ts (marketplace-router/group-travel precedent):
// business refusals stay VALUES in the response; TRPCErrors are reserved for
// auth/validation/not-found.
import { TRPCError } from "@trpc/server";
import { router, agentProcedure } from "../trpc.js";
import {
  acceptTripHandoffRequest,
  acceptTripHandoffRequestInputSchema,
  listTripHandoffRequests,
} from "../services/trip-handoffs.js";

export const tripHandoffsRouter = router({
  /** The signed-in agency's own requests, newest-first (contract §2). */
  list: agentProcedure.query(({ ctx }) => {
    return listTripHandoffRequests(ctx.container, ctx.session);
  }),

  /** new -> accepted, tenant-scoped and idempotent (contract §3). */
  accept: agentProcedure
    .input((value) => acceptTripHandoffRequestInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await acceptTripHandoffRequest(ctx.container, ctx.session, input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),
});
