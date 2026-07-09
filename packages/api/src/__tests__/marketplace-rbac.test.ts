// L2 contract test — the workspace.marketplace.* authorization ladder
// (spec 006 T018, INV-023/024): every marketplace procedure is agent-gated, so
// an ANONYMOUS caller gets UNAUTHORIZED and a TRAVELER session (no agency)
// gets FORBIDDEN — before any input validation or database access runs (the
// container here has NO db; reaching the flow would throw a different error,
// so these outcomes prove the gate fired first). Business-path behavior is
// covered by l3-marketplace.test.ts against a real Postgres.
import { describe, it, expect } from "vitest";
import { appRouter } from "../routers/root.js";
import { buildContainer } from "../container.js";
import type { SessionContext, TrpcContext } from "../context.js";

function ctxFor(session: SessionContext | null): TrpcContext {
  return { session, container: buildContainer() };
}

const traveler: SessionContext = { userId: "u-traveler" }; // no agency membership

const LISTING_ID = "3f1e9a52-7c44-4b8e-9a3e-2f60d1a0b9c1";
const ITINERARY_ID = "b7a3c9d0-1e2f-4a5b-8c6d-7e8f9a0b1c2d";

const calls = [
  ["createListing", (c: ReturnType<typeof appRouter.createCaller>) =>
    c.workspace.marketplace.createListing({
      itineraryId: ITINERARY_ID,
      title: "t",
      priceMinor: 100,
      licenseTerms: "terms",
      revenueShareBps: 100,
    })],
  ["browseListings", (c: ReturnType<typeof appRouter.createCaller>) => c.workspace.marketplace.browseListings()],
  ["deactivateListing", (c: ReturnType<typeof appRouter.createCaller>) =>
    c.workspace.marketplace.deactivateListing({ listingId: LISTING_ID })],
  ["licenseListing", (c: ReturnType<typeof appRouter.createCaller>) =>
    c.workspace.marketplace.licenseListing({ listingId: LISTING_ID })],
  ["rateListing", (c: ReturnType<typeof appRouter.createCaller>) =>
    c.workspace.marketplace.rateListing({ listingId: LISTING_ID, stars: 5 })],
] as const;

describe("workspace.marketplace.* authorization ladder (INV-023)", () => {
  for (const [name, invoke] of calls) {
    it(`${name}: anonymous → UNAUTHORIZED`, async () => {
      const caller = appRouter.createCaller(ctxFor(null));
      await expect(invoke(caller)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it(`${name}: traveler (no agency) → FORBIDDEN`, async () => {
      const caller = appRouter.createCaller(ctxFor(traveler));
      await expect(invoke(caller)).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: /agency membership/i,
      });
    });
  }
});
