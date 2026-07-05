// Public surface of @tripforge/api — the tRPC router + context + composition root.
export { appRouter } from "./routers/root.js";
export type { AppRouter } from "./routers/root.js";
export { createContext } from "./context.js";
export type {
  TrpcContext,
  CreateContextArgs,
  Container,
  SessionContext,
  AgentSessionContext,
  AgencyRole,
} from "./context.js";
export { buildContainer } from "./container.js";
export type { BuildContainerOptions } from "./container.js";
export {
  router,
  publicProcedure,
  protectedProcedure,
  agentProcedure,
  agencyAdminProcedure,
} from "./trpc.js";
