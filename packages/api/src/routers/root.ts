// Root tRPC router — the single surface web and mobile consume (INV-018). No client
// reaches the DB or an adapter except through these procedures.
import { router, publicProcedure, createCallerFactory } from "../trpc.js";
import { workspaceRouter } from "./workspace.js";
import { clientViewRouter } from "./client-view.js";

export const appRouter = router({
  /** Public liveness — open to any caller regardless of role. */
  health: publicProcedure.query(() => {
    return { status: "ok" as const };
  }),

  /** Agency workspace (agent-only) procedures. */
  workspace: workspaceRouter,

  /** Traveler client-view surface (public, token-granted — spec 010). */
  clientView: clientViewRouter,
});

export type AppRouter = typeof appRouter;

/** In-process caller over the SAME surface (INV-018) for server components. */
export const createAppCaller = createCallerFactory(appRouter);
