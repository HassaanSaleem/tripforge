// tRPC HTTP mount (INV-018): the single server surface web + mobile consume. Uses
// the fetch adapter so it runs as a stateless Next.js route handler (INV-028 —
// serverless build contract, no in-process cross-request state).
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@tripforge/api";
import { createTrpcContext } from "../../../../lib/trpc/server.js";

// The AI draft (itinerary.draft/selectDraft) streams and now runs a web-search
// destination-grounding pass (~30-40s for a new destination) before the draft
// tool loop — so raise the function budget above the platform default. Clamped
// to the plan's max by Vercel; the grounding pass is itself capped in
// packages/api so it can never dominate this budget. (Route Segment Config.)
export const maxDuration = 300;

function handler(req: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTrpcContext(req.headers),
  });
}

export { handler as GET, handler as POST };
