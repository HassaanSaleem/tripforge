// tRPC initialization + the role/tenant middleware that enforces authorization per
// procedure (INV-023). Authorization is NEVER UI visibility — every protected
// procedure declares its required role here.
import { initTRPC, TRPCError } from "@trpc/server";
import type { TrpcContext, AgentSessionContext } from "./context.js";

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;

/** Open to anyone (e.g. health/liveness). */
export const publicProcedure = t.procedure;

/** Any authenticated user (agent or traveler). */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/**
 * Agency WORKSPACE procedures (INV-024): the caller must be an agent — a user with
 * a verified agency (organization) membership. A traveler session (no agencyId) is
 * rejected with FORBIDDEN. The agent's `agencyId` is the tenant scope (INV-004) and
 * is made non-optional on the narrowed context so downstream handlers cannot forget
 * to scope by it.
 */
export const agentProcedure = t.procedure.use(({ ctx, next }) => {
  const session = ctx.session;
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (!session.agencyId || !session.agencyRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Workspace procedures require an agency membership.",
    });
  }
  const agentSession: AgentSessionContext = {
    ...session,
    agencyId: session.agencyId,
    agencyRole: session.agencyRole,
  };
  return next({ ctx: { ...ctx, session: agentSession } });
});

/** Agency administration (owner/admin only) — e.g. members, billing, markup policy. */
export const agencyAdminProcedure = agentProcedure.use(({ ctx, next }) => {
  if (ctx.session.agencyRole !== "owner" && ctx.session.agencyRole !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Requires an agency owner or admin role.",
    });
  }
  return next({ ctx });
});
