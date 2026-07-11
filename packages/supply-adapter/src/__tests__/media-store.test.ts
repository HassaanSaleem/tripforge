// L1 — the one branch of SandboxMediaStoreAdapter that touches no database
// (the closed-enum refusal returns before any query). DB-dependent branches
// (register/list/get tenant scoping, round-trips) are covered at L3 in
// packages/api/src/__tests__/l3-media.test.ts against real Postgres —
// mirroring the precedent set for ratingAggregates/earningsAggregates
// (packages/marketplace): mocking a Drizzle query builder would be a
// first-of-its-kind brittle pattern this codebase deliberately avoids.
import { describe, expect, it } from "vitest";
import { SandboxMediaStoreAdapter } from "../sandbox/media-store.js";

describe("SandboxMediaStoreAdapter.register (closed-enum refusal)", () => {
  it("refuses a source outside the closed set without touching the database", async () => {
    const adapter = new SandboxMediaStoreAdapter(undefined);
    const outcome = await adapter.register({
      agencyId: "agency-1",
      // @ts-expect-error — deliberately outside the closed MediaSource set
      source: "scraped-web",
      kind: "image",
      url: "https://example.com/photo.jpg",
      alt: "A photo",
    });
    expect(outcome).toEqual({ status: "refused", reason: "invalid_source" });
  });
});
