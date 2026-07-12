// L2 contract test (tRPC caller, no DB) — the closed MediaSource enum names
// its allowed members in the refusal instead of a raw zod issue dump
// (seed-0024). No database is touched: the refusal fires before the input
// even reaches the adapter, so nothing persists.
import { describe, it, expect } from "vitest";
import { appRouter } from "../routers/root.js";
import { buildContainer } from "../container.js";
import type { SessionContext, TrpcContext } from "../context.js";

function ctxFor(session: SessionContext | null): TrpcContext {
  return { session, container: buildContainer() };
}

const agent: SessionContext = { userId: "u-agent", agencyId: "org-1", agencyRole: "member" };

const VALID_MEDIA = {
  kind: "image" as const,
  url: "https://images.example.test/lisbon-view.jpg",
  alt: "View over the Tagus river",
};

describe("workspace.media.register — closed MediaSource enum refusal (seed-0024)", () => {
  it("names every allowed member when the source is outside the closed set", async () => {
    const caller = appRouter.createCaller(ctxFor(agent));
    await expect(
      caller.workspace.media.register({
        ...VALID_MEDIA,
        // @ts-expect-error — deliberately outside the closed MediaSource set
        source: "scraped-web",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Media source must be one of: licensed-stock, official-embed, agent-upload, traveler-ugc.",
    });
  });
});
