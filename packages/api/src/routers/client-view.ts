// clientView.* — the traveler surface (spec 010 contract §2, INV-018: the same
// procedure a future mobile client consumes). `itinerary`/`requestHandoff` stay
// PUBLIC: possession of an unguessable token is the read grant (link-bearer
// access), no session is read or required. Business outcomes are typed values —
// not_found is a payload, never an error, so the page renders a neutral
// unavailable state with no existence oracle. `me` (spec 030), `attachTrip`
// and `myTrips` (spec 031) are the session-aware procedures here —
// protectedProcedure, any authenticated user.
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import {
  resolveShareLink,
  getSignedInIdentity,
  attachTraveler,
  listTravelerTrips,
} from "../services/client-view.js";
import { selfBookItinerary } from "../services/booking.js";
import { submitTripHandoffRequest, submitTripHandoffRequestInputSchema } from "../services/trip-handoffs.js";
import {
  interpretChatRequestInputSchema,
  interpretChatTripRequest,
  tripRequestSchema,
} from "../services/planner.js";
import {
  draftConsumerOptions,
  submitConsumerPlanRequest,
  submitConsumerPlanRequestInputSchema,
} from "../services/consumer-planner.js";

const getInputSchema = z.strictObject({ token: z.uuid() });

export const clientViewRouter = router({
  /** Share token → redacted ClientItineraryView (allowlist projection). */
  itinerary: publicProcedure
    .input((value) => getInputSchema.parse(value))
    .query(({ ctx, input }) => resolveShareLink(ctx.container, input.token)),

  /** The request-an-agent fork choice (spec 022 contract §1). */
  requestHandoff: publicProcedure
    .input((value) => submitTripHandoffRequestInputSchema.parse(value))
    .mutation(({ ctx, input }) => submitTripHandoffRequest(ctx.container, input)),

  /** Signed-in caller's own identity, for request-agent form pre-fill (spec 030
   * contract §1). Any authenticated user (traveler OR agent) — first mount of
   * `protectedProcedure`. Anonymous callers get UNAUTHORIZED. */
  me: protectedProcedure.query(({ ctx }) => getSignedInIdentity(ctx.container, ctx.session.userId)),

  /** Record that the signed-in caller has opened this trip (spec 031 contract
   * §1) — idempotent, "attach on view." Anonymous callers get UNAUTHORIZED;
   * the client-view page only calls this from the already-authenticated
   * branch (defense in depth, not a path the UI drives into). */
  attachTrip: protectedProcedure
    .input((value) => getInputSchema.parse(value))
    .mutation(({ ctx, input }) => attachTraveler(ctx.container, ctx.session, input.token)),

  /** The signed-in caller's own "My Trips" list (spec 031 contract §2) — never
   * another visitor's trips (FR-005). */
  myTrips: protectedProcedure.query(({ ctx }) => listTravelerTrips(ctx.container, ctx.session.userId)),

  /** Traveler self-drive booking (spec 036 contract; GOAL.md D2.4 — MONEY PATH).
   * A signed-in traveler books the shared itinerary's bookable un-booked items
   * through the SAME quote-then-book path an agent uses, scoped to the owning
   * agency resolved from the token (INV-024: a traveler NEVER invokes a
   * workspace procedure). protectedProcedure — anonymous callers get
   * UNAUTHORIZED and are prompted to sign in (FR-009). The outcome is redacted
   * (INV-020); state conservation is inherited from bookItinerary (INV-011). */
  selfBook: protectedProcedure
    .input((value) => getInputSchema.parse(value))
    .mutation(({ ctx, input }) => selfBookItinerary(ctx.container, ctx.session, input.token)),

  /** Consumer chat-first planner — interpret one chat turn (+ prior turns) into
   * a TripRequest (spec 038 US1). REUSES the agent chat interpreter, which is
   * session-free; protectedProcedure so a traveler (no agency) may call it but
   * anonymous callers get UNAUTHORIZED (INV-024: NOT a workspace procedure). */
  planInterpret: protectedProcedure
    .input((value) => interpretChatRequestInputSchema.parse(value))
    .mutation(({ ctx, input }) => interpretChatTripRequest(ctx.container, input)),

  /** Consumer compare — 1-3 budget-fit, live-priced options for the traveler
   * (spec 038 US1). Streamed like the agent `draft` (INV-028). REUSES the SAME
   * draftOptions engine under an ephemeral tenant; redacted to sell-price-only
   * (INV-020) and NEVER persisted (no booking/markup/trip_created write). */
  planDraft: protectedProcedure
    .input((value) => tripRequestSchema.parse(value))
    .subscription(({ ctx, input }) => draftConsumerOptions(ctx.container, input)),

  /** Request-an-agent fork (spec 038 US2) — a durable, agency-less, NON-money
   * lead that routes the traveler's self-planned demand into the agent network
   * (Constitution I). protectedProcedure; anonymous → UNAUTHORIZED. */
  requestPlan: protectedProcedure
    .input((value) => submitConsumerPlanRequestInputSchema.parse(value))
    .mutation(({ ctx, input }) => submitConsumerPlanRequest(ctx.container, ctx.session, input)),
});
