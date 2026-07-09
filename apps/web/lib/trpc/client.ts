// Typed browser tRPC client (spec 008 research D1/D3) — the one way web client
// components call the server, over the SAME mounted /api/trpc surface mobile
// will consume (INV-018). Browser-only module: the relative same-origin URL
// carries the Better Auth session cookie automatically. No transformer — the
// server's initTRPC configures none.
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@tripforge/api";

export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc" })],
});

/**
 * Draft input/outcome types via router inference (research D5): the server's
 * DraftOutcome/TripRequest stay un-exported (QS3-1 premature-export rule);
 * inference keeps this client exactly in sync with the deployed contract.
 */
export type DraftInput = inferRouterInputs<AppRouter>["workspace"]["itinerary"]["draft"];
export type DraftOutput = inferRouterOutputs<AppRouter>["workspace"]["itinerary"]["draft"];
