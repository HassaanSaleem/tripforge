// workspace.dashboard.* — agent-gated Agent Home aggregate (spec 017
// contract §1). Read-only; tenant-scoped at the query itself (INV-004) via
// dashboardStats.
import { TRPCError } from "@trpc/server";
import { router, agentProcedure } from "../trpc.js";
import { dashboardStats } from "../services/dashboard-stats.js";

export const dashboardRouter = router({
  /** GBV/earnings-by-currency, active-trip/listing/license counts, and a
   * short recent-activity list — all derived from the agency's own already-
   * recorded data (spec 017 FR-002/003/004). */
  stats: agentProcedure.query(({ ctx }) => {
    const db = ctx.container.db;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "database not configured" });
    return dashboardStats(db, ctx.session.agencyId);
  }),
});
