// Agency workspace router (agent surface). Every procedure here is agent-gated
// (INV-023/024): a traveler session can never reach it.
import { router, agentProcedure } from "../trpc.js";

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
});
