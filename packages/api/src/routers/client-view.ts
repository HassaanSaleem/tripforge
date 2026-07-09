// clientView.* — the PUBLIC traveler surface (spec 010 contract §2, INV-018:
// the same procedure a future mobile client consumes). No session is read;
// possession of an unguessable token is the read grant (link-bearer access).
// Business outcomes are typed values — not_found is a payload, never an error,
// so the page renders a neutral unavailable state with no existence oracle.
import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { resolveShareLink } from "../services/client-view.js";

const getInputSchema = z.strictObject({ token: z.uuid() });

export const clientViewRouter = router({
  /** Share token → redacted ClientItineraryView (allowlist projection). */
  itinerary: publicProcedure
    .input((value) => getInputSchema.parse(value))
    .query(({ ctx, input }) => resolveShareLink(ctx.container, input.token)),
});
