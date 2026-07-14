// Public surface of @tripforge/api — the tRPC router + context + composition root.
export { appRouter, createAppCaller } from "./routers/root.js";
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
// Draft streaming types surfaced the same way (spec 016): itinerary.draft is
// now a subscription, so DraftEvent/DraftOutcome ride the inferred AppRouter
// type and must be nameable (TS4023). Spec 019: draft is compare-only
// (CompareEvent/CompareOutcome/DraftOption); selectDraft persists and reuses
// DraftEvent/DraftOutcome's pre-existing shape; SelectDraftInput is the
// selectDraft procedure's own input type — same TS4023 nameability need.
export type { DraftEvent, DraftOutcome, CompareEvent, CompareOutcome, DraftOption, SelectDraftInput } from "./services/planner.js";
// Marketplace-picker projection surfaced the same way (spec 011). Attach/
// detach outcome types surfaced the same way (spec 015). Chat-edit outcome
// types surfaced the same way (spec 020): chatEdit is a subscription and
// applyChatEdit a mutation, both riding the inferred AppRouter type.
export type {
  MyItinerary,
  MediaTarget,
  AttachMediaOutcome,
  DetachMediaOutcome,
  ChatEditEvent,
  ChatEditOutcome,
  ApplyChatEditOutcome,
} from "./services/itineraries.js";
// Media library outcome types surfaced the same way (spec 015, TS4023).
export type { RegisterMediaServiceInput, GetMediaOutcome } from "./services/media.js";
export type { RegisterMediaOutcome } from "@tripforge/supply-adapter";
// Client-view types surfaced the same way (spec 010): the share/resolve outcome
// unions ride the inferred AppRouter type, and ClientItineraryView is what the
// server-component page renders.
export type {
  ClientItineraryView,
  ClientViewDay,
  ClientViewItem,
  ClientViewMedia,
  CreateShareLinkOutcome,
  ResolveShareLinkOutcome,
} from "./services/client-view.js";
// Agent Home dashboard aggregate surfaced the same way (spec 017, TS4023):
// DashboardStats rides the inferred AppRouter type via workspace.dashboard.stats.
export type { DashboardStats, CurrencyTotal, RecentActivityEntry } from "./services/dashboard-stats.js";
export { buildContainer } from "./container.js";
export type { BuildContainerOptions } from "./container.js";
export {
  router,
  publicProcedure,
  protectedProcedure,
  agentProcedure,
  agencyAdminProcedure,
} from "./trpc.js";
