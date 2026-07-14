// Agency workspace router (agent surface). Every procedure here is agent-gated
// (INV-023/024): a traveler session can never reach it.
import { router, agentProcedure } from "../trpc.js";
import { itineraryRouter } from "./itinerary.js";
import { bookingRouter } from "./booking.js";
import { marketplaceRouter } from "./marketplace.js";
import { workspaceMediaRouter } from "./workspace-media.js";
import { dashboardRouter } from "./dashboard.js";
import { groupTravelRouter } from "./group-travel.js";
import { tripHandoffsRouter } from "./trip-handoffs.js";

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

  /** Trade: list / license-white-label / rate (spec 006). */
  marketplace: marketplaceRouter,

  /** Content: agency media library — register/list/get (spec 015). */
  media: workspaceMediaRouter,

  /** Agent Home dashboard aggregate — GBV/earnings/counts/recent activity (spec 017). */
  dashboard: dashboardRouter,

  /** Group travel: post/cancel/browse/join group departures (spec 021). */
  groupTravel: groupTravelRouter,

  /** Trip requests: the "have an agent arrange this" inbox (spec 022). */
  tripHandoffs: tripHandoffsRouter,
});
