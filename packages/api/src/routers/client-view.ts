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
import { submitTripHandoffRequest, submitTripHandoffRequestInputSchema } from "../services/trip-handoffs.js";

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
});
