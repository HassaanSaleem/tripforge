// L2 caller tests for the Build→Book procedures (spec 005 FR-013): the RBAC
// ladder is enforced per procedure (INV-023) and inputs are rejected at the
// boundary before any handler work. Flow behavior against a real database
// lives in l3-booking.test.ts (env-gated); nothing here needs Postgres.
import { describe, it, expect } from "vitest";
import { appRouter } from "../routers/root.js";
import { buildContainer } from "../container.js";
import type { SessionContext, TrpcContext } from "../context.js";

function ctxFor(session: SessionContext | null): TrpcContext {
  return { session, container: buildContainer() };
}

const agent: SessionContext = { userId: "u-agent", agencyId: "org-1", agencyRole: "member" };
const traveler: SessionContext = { userId: "u-traveler" };

const VALID_DRAFT_INPUT = {
  destination: "Paris",
  checkIn: "2026-09-01",
  checkOut: "2026-09-03",
  party: { adults: 2, children: 0 },
  budget: { mode: "hardCap", amountMinor: 100_000, currency: "USD" },
} as const;
const SOME_UUID = "3f0e8a52-70cf-4f8e-b6ad-53b1f0c72b3e";

describe("RBAC ladder on every Build→Book procedure (INV-023/024)", () => {
  const cases: Array<[string, (ctx: TrpcContext) => Promise<unknown>]> = [
    ["itinerary.draft", (ctx) => appRouter.createCaller(ctx).workspace.itinerary.draft(VALID_DRAFT_INPUT)],
    [
      "itinerary.selectDraft",
      (ctx) =>
        appRouter.createCaller(ctx).workspace.itinerary.selectDraft({ tripRequest: VALID_DRAFT_INPUT, variant: "balanced" }),
    ],
    ["itinerary.get", (ctx) => appRouter.createCaller(ctx).workspace.itinerary.get({ itineraryId: SOME_UUID })],
    [
      "booking.quote",
      (ctx) => appRouter.createCaller(ctx).workspace.booking.quote({ itineraryId: SOME_UUID, markupBps: 1500 }),
    ],
    [
      "booking.book",
      (ctx) => appRouter.createCaller(ctx).workspace.booking.book({ itineraryId: SOME_UUID, quoteRowIds: [SOME_UUID] }),
    ],
  ];

  for (const [name, call] of cases) {
    it(`${name}: anonymous → UNAUTHORIZED`, async () => {
      await expect(call(ctxFor(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
    it(`${name}: traveler (no agency) → FORBIDDEN`, async () => {
      await expect(call(ctxFor(traveler))).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  }
});

describe("boundary validation (zod at every boundary)", () => {
  it("rejects a draft with checkOut before checkIn", async () => {
    const caller = appRouter.createCaller(ctxFor(agent));
    await expect(
      caller.workspace.itinerary.draft({ ...VALID_DRAFT_INPUT, checkIn: "2026-09-05", checkOut: "2026-09-01" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects zero party, non-integer money, unknown fields, bad uuids", async () => {
    const caller = appRouter.createCaller(ctxFor(agent));
    await expect(
      caller.workspace.itinerary.draft({ ...VALID_DRAFT_INPUT, party: { adults: 0, children: 0 } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.workspace.itinerary.draft({
        ...VALID_DRAFT_INPUT,
        budget: { mode: "hardCap", amountMinor: 10.5, currency: "USD" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const withUnknownField = { ...VALID_DRAFT_INPUT, freeUpgrade: true };
    await expect(
      caller.workspace.itinerary.draft(withUnknownField as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.workspace.booking.quote({ itineraryId: "not-a-uuid", markupBps: 1500 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.workspace.booking.book({ itineraryId: SOME_UUID, quoteRowIds: [] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a negative or oversized markup", async () => {
    const caller = appRouter.createCaller(ctxFor(agent));
    await expect(caller.workspace.booking.quote({ itineraryId: SOME_UUID, markupBps: -1 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller.workspace.booking.quote({ itineraryId: SOME_UUID, markupBps: 10_001 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects selectDraft with an unknown variant (spec 019 fixed vocabulary)", async () => {
    const caller = appRouter.createCaller(ctxFor(agent));
    await expect(
      caller.workspace.itinerary.selectDraft({ tripRequest: VALID_DRAFT_INPUT, variant: "luxury" as never }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects selectDraft with a malformed tripRequest (same checks as draft)", async () => {
    const caller = appRouter.createCaller(ctxFor(agent));
    await expect(
      caller.workspace.itinerary.selectDraft({
        tripRequest: { ...VALID_DRAFT_INPUT, checkIn: "2026-09-05", checkOut: "2026-09-01" },
        variant: "balanced",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
