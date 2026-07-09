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
// Booking response types surfaced by the router's inferred AppRouter type —
// declaration emit must be able to NAME them (TS4023), so they are public
// surface here, not incidental service exports (QS3-1).
export type { BookOutcome, HeldQuote } from "./services/booking.js";
export { buildContainer } from "./container.js";
export type { BuildContainerOptions } from "./container.js";
export {
  router,
  publicProcedure,
  protectedProcedure,
  agentProcedure,
  agencyAdminProcedure,
} from "./trpc.js";
