// tRPC HTTP mount (INV-018): the single server surface web + mobile consume. Uses
// the fetch adapter so it runs as a stateless Next.js route handler (INV-028 —
// serverless build contract, no in-process cross-request state).
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@tripforge/api";
import { createTrpcContext } from "../../../../lib/trpc/server.js";

function handler(req: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTrpcContext(req.headers),
  });
}

export { handler as GET, handler as POST };
