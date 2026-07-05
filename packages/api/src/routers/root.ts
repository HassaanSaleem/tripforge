// Root tRPC router — the single surface web and mobile consume (INV-018). No client
// reaches the DB or an adapter except through these procedures.
import { router, publicProcedure } from "../trpc.js";
import { workspaceRouter } from "./workspace.js";

export const appRouter = router({
  /** Public liveness — open to any caller regardless of role. */
  health: publicProcedure.query(() => {
    return { status: "ok" as const };
  }),

  /** Agency workspace (agent-only) procedures. */
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
