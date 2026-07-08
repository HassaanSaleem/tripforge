// workspace.booking.* — the quote-then-book money path (contracts §3–4).
// Per-component business failures are VALUES in the response; TRPCErrors are
// reserved for auth/validation/not-found.
import { TRPCError } from "@trpc/server";
import { router, agentProcedure } from "../trpc.js";
import { bookInputSchema, bookItinerary, quoteInputSchema, quoteItinerary } from "../services/booking.js";

export const bookingRouter = router({
  /** Firm price holds with expiry + markup for an itinerary's items (US2). */
  quote: agentProcedure
    .input((value) => quoteInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await quoteItinerary(ctx.container, ctx.session, input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),

  /** Book held quotes; partial failure per component, conservation on failure (US2/US3). */
  book: agentProcedure
    .input((value) => bookInputSchema.parse(value))
    .mutation(async ({ ctx, input }) => {
      const result = await bookItinerary(ctx.container, ctx.session, input);
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result;
    }),
});
