// Agency workspace router (agent surface). Every procedure here is agent-gated
// (INV-023/024): a traveler session can never reach it.
import { router, agentProcedure } from "../trpc.js";
import { itineraryRouter } from "./itinerary.js";
import { bookingRouter } from "./booking.js";

export const workspaceRouter = router({
  /**
   * Identity echo for the authenticated agent — the smallest procedure that proves
   * the session + org context flowed through the role/tenant middleware. Returns the
   * agent's tenant scope (agencyId) so callers can confirm INV-004 scoping.
   */
  whoami: agentProcedure.query(({ ctx }) => {
    return {
      userId: ctx.session.userId,
      agencyId: ctx.session.agencyId,
      role: ctx.session.agencyRole,
    };
  }),

  /** Build: describe-trip → budget-fit, live-priced draft (spec 005 US1). */
  itinerary: itineraryRouter,

  /** Book: quote-then-book money path (spec 005 US2/US3). */
  booking: bookingRouter,
});
