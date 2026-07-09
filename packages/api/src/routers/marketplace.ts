// workspace.marketplace.* — the trade layer (spec 006, contracts §1–5).
// Thin adapter over @tripforge/marketplace flows (booking-router precedent):
// zod parse, session → MarketplaceActor, business refusals stay VALUES in the
// response; TRPCErrors are reserved for auth/validation/not-found.
import { TRPCError } from "@trpc/server";
import {
  browseListings,
  createListing,
  createListingInputSchema,
  deactivateListing,
  deactivateListingInputSchema,
  licenseListing,
  licenseListingInputSchema,
  rateListing,
  rateListingInputSchema,
  type MarketplaceActor,
} from "@tripforge/marketplace";
import { router, agentProcedure } from "../trpc.js";
import type { Container, AgentSessionContext } from "../context.js";

function requireDb(container: Container): NonNullable<Container["db"]> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  return db;
}

function actorOf(session: AgentSessionContext): MarketplaceActor {
  return { agencyId: session.agencyId, userId: session.userId };
}

export const marketplaceRouter = router({
  /** List a finished, owned itinerary with license terms (US1, contracts §1). */
  createListing: agentProcedure
    .input((value) => createListingInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await createListing(requireDb(ctx.container), actorOf(ctx.session), input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),

  /** Active listings, public projection — cross-tenant by design (contracts §2). */
  browseListings: agentProcedure.query(({ ctx }) => {
    return browseListings(requireDb(ctx.container), actorOf(ctx.session));
  }),

  /** Seller takes a listing off the marketplace (contracts §3). */
  deactivateListing: agentProcedure
    .input((value) => deactivateListingInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await deactivateListing(requireDb(ctx.container), actorOf(ctx.session), input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),

  /** License + white-label in ONE transaction — the INV-012 money path (US2, contracts §4). */
  licenseListing: agentProcedure
    .input((value) => licenseListingInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await licenseListing(requireDb(ctx.container), actorOf(ctx.session), input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),

  /** Licensee-only rating, upsert semantics (US3, contracts §5). */
  rateListing: agentProcedure
    .input((value) => rateListingInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await rateListing(requireDb(ctx.container), actorOf(ctx.session), input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),
});
