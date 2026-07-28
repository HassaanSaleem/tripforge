// clientView.groups.* — traveler group trips (spec 040). Thin adapter over
// services/group-trips.ts (client-view/group-travel router precedent): zod parse,
// session → service call, business refusals stay VALUES in the response so the
// UI can render the right prompt (e.g. "become a verified premium member" on
// not_eligible). Every procedure is `protectedProcedure` — a signed-in traveler
// (or agent) user; the eligibility gate lives in the service, not the guard.
// Mounted under clientView (the traveler surface, INV-024) — NEVER workspace.*.
import { router, protectedProcedure } from "../trpc.js";
import {
  cancelGroup,
  confirmMembership,
  createGroup,
  createGroupInputSchema,
  finalizeGroup,
  getGroup,
  getGroupInputSchema,
  groupIdInputSchema,
  joinGroup,
  joinGroupInputSchema,
  listMyGroups,
  getMembership,
  postMessage,
  postMessageInputSchema,
  verifyMembership,
} from "../services/group-trips.js";

export const groupTripsRouter = router({
  /** The caller's own premium/identity membership state. */
  membership: protectedProcedure.query(({ ctx }) => getMembership(ctx.container, ctx.session.userId)),

  /** v0 self-serve become-a-verified-premium-member (KYC/billing stand-in). */
  verify: protectedProcedure.mutation(({ ctx }) => verifyMembership(ctx.container, ctx.session.userId)),

  /** Create + post a group around a trip the caller can resolve (US1). */
  create: protectedProcedure
    .input((value) => createGroupInputSchema.parse(value))
    .mutation(({ ctx, input }) => createGroup(ctx.container, ctx.session, input)),

  /** Join a forming, joinable group via its invite token (US2). */
  join: protectedProcedure
    .input((value) => joinGroupInputSchema.parse(value))
    .mutation(({ ctx, input }) => joinGroup(ctx.container, ctx.session, input)),

  /** The caller's own groups, newest first (FR-009). */
  mine: protectedProcedure.query(({ ctx }) => listMyGroups(ctx.container, ctx.session.userId)),

  /** Member-only group detail: roster + confirmation + chat (FR-005/006). */
  get: protectedProcedure
    .input((value) => getGroupInputSchema.parse(value))
    .query(({ ctx, input }) => getGroup(ctx.container, ctx.session, input.groupId)),

  /** Post an in-group chat message (member-only, FR-006). */
  message: protectedProcedure
    .input((value) => postMessageInputSchema.parse(value))
    .mutation(({ ctx, input }) => postMessage(ctx.container, ctx.session, input)),

  /** Confirm the caller's own participation (FR-007). */
  confirm: protectedProcedure
    .input((value) => groupIdInputSchema.parse(value))
    .mutation(({ ctx, input }) => confirmMembership(ctx.container, ctx.session, input.groupId)),

  /** Organizer finalizes — gated on all-party confirmation (FR-008). */
  finalize: protectedProcedure
    .input((value) => groupIdInputSchema.parse(value))
    .mutation(({ ctx, input }) => finalizeGroup(ctx.container, ctx.session, input.groupId)),

  /** Organizer cancels a forming group (FR-010). */
  cancel: protectedProcedure
    .input((value) => groupIdInputSchema.parse(value))
    .mutation(({ ctx, input }) => cancelGroup(ctx.container, ctx.session, input.groupId)),
});
