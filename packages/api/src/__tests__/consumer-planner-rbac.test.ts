// L2 contract test — the consumer planner authorization boundary (spec 038,
// INV-023/024). The traveler-facing clientView planner procedures are
// protectedProcedure (any authenticated user; anonymous → UNAUTHORIZED), and a
// traveler session may NEVER reach the agent workspace draft engine (→ FORBIDDEN)
// — both proven BEFORE any database access (the container here has NO db, so
// reaching the flow would throw a different error). Business-path behavior is
// covered by l3-consumer-planner.test.ts against a real Postgres.
import { describe, it, expect } from "vitest";
import { appRouter } from "../routers/root.js";
import { buildContainer } from "../container.js";
import type { SessionContext, TrpcContext } from "../context.js";

function ctxFor(session: SessionContext | null): TrpcContext {
  return { session, container: buildContainer() };
}

const traveler: SessionContext = { userId: "u-traveler" }; // no agency membership

const TRIP = {
  destination: "Lisbon",
  checkIn: "2026-09-01",
  checkOut: "2026-09-05",
  party: { adults: 2, children: 0 },
  budget: { mode: "hardCap", amountMinor: 200_000, currency: "EUR" },
} as const;

describe("consumer planner authorization (INV-023/INV-024)", () => {
  it("a traveler session is FORBIDDEN on the agent workspace draft engine (INV-024)", async () => {
    const caller = appRouter.createCaller(ctxFor(traveler));
    await expect(caller.workspace.itinerary.draft(TRIP)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: /agency membership/i,
    });
    await expect(
      caller.workspace.itinerary.interpretChatRequest({ message: "Plan a trip to Lisbon" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("anonymous callers get UNAUTHORIZED on every consumer planner procedure", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    await expect(caller.clientView.planInterpret({ message: "Plan a trip to Lisbon around EUR 2000 for 4 nights" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.clientView.planDraft(TRIP)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.clientView.requestPlan({ tripRequest: TRIP, variant: "balanced", optionTitle: "x", contactName: "x" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("a signed-in traveler IS allowed to interpret a chat turn (protectedProcedure, no agency needed)", async () => {
    const caller = appRouter.createCaller(ctxFor(traveler));
    // interpret needs no db (rides FakeLLM) — proves the traveler is past the gate.
    const result = await caller.clientView.planInterpret({
      message: "Plan a trip to Lisbon around EUR 2000 for 4 nights, 2 people",
    });
    expect(result.status).toBe("resolved");
  });
});
