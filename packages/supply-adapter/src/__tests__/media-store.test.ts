// L1 — the branches of SandboxMediaStoreAdapter that touch no database (all
// refusals return before any query — spec 027 research D4/D5). DB-dependent
// branches (register/upload/list/get/getBytesById tenant scoping, round-
// trips) are covered at L3 in packages/api/src/__tests__/l3-media.test.ts
// against real Postgres — mirroring the precedent set for
// ratingAggregates/earningsAggregates (packages/marketplace): mocking a
// Drizzle query builder would be a first-of-its-kind brittle pattern this
// codebase deliberately avoids.
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

describe("SandboxMediaStoreAdapter.upload (spec 027 US1)", () => {
  const validInput = {
    agencyId: "agency-1",
    source: "agent-upload" as const,
    kind: "image" as const,
    mimeType: "image/jpeg" as const,
    alt: "A photo",
    data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  };

  it("refuses a source outside the closed set without touching the database", async () => {
    const adapter = new SandboxMediaStoreAdapter(undefined);
    const outcome = await adapter.upload({
      ...validInput,
      // @ts-expect-error — deliberately outside the closed MediaSource set
      source: "scraped-web",
    });
    expect(outcome).toEqual({ status: "refused", reason: "invalid_source" });
  });

  it("refuses a mime type outside the closed image allowlist without touching the database", async () => {
    const adapter = new SandboxMediaStoreAdapter(undefined);
    const outcome = await adapter.upload({
      ...validInput,
      // @ts-expect-error — deliberately outside the closed mime-type set
      mimeType: "application/pdf",
    });
    expect(outcome).toEqual({ status: "refused", reason: "invalid_mime_type" });
  });

  it("refuses a payload over the 3 MB cap without touching the database", async () => {
    const adapter = new SandboxMediaStoreAdapter(undefined);
    const oversized = new Uint8Array(3 * 1024 * 1024 + 1);
    const outcome = await adapter.upload({ ...validInput, data: oversized });
    expect(outcome).toEqual({ status: "refused", reason: "file_too_large" });
  });
});

describe("SandboxMediaStoreAdapter.getBytesById", () => {
  it("throws without a configured database, same guard as every other method", async () => {
    const adapter = new SandboxMediaStoreAdapter(undefined);
    await expect(adapter.getBytesById("some-id")).rejects.toThrow("database not configured");
  });
});
