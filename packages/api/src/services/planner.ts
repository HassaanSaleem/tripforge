// Draft orchestration (spec 005 US1; contracts §1): allocate (pure) → planner
// via LLMPort (bounded, injected tool executors — research D7) → re-verify
// every proposal against the supply ports (FR-003: verification defines truth;
// unverified offers are dropped) → assemble to fit (pure) → persist the
// canonical document + trip_created PMF event in ONE transaction (INV-021).
// Business failures are values; nothing is persisted on any failure path.
import { randomUUID } from "node:crypto";
import {
  allocateBudget,
  assembleItinerary,
  stampProvenance,
  type AssembleResult,
  type DraftDayProposal,
  type VerifiedOffer,
} from "@tripforge/domain";
import type { Itinerary } from "@tripforge/itinerary-schema";
import { itinerary as itineraryTable, recordPmfEvent } from "@tripforge/db";
import type { PlannerToolDeps } from "@tripforge/llm";
import { z } from "zod";
import type { AgentSessionContext, Container } from "../context.js";

export const tripRequestSchema = z
  .strictObject({
    destination: z.string().min(1),
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date (YYYY-MM-DD)"),
    checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date (YYYY-MM-DD)"),
    party: z.strictObject({
      adults: z.number().int().min(1),
      children: z.number().int().min(0).default(0),
    }),
    tripStyle: z.enum(["balanced", "budget", "premium"]).optional(),
    budget: z.strictObject({
      mode: z.enum(["hardCap", "target"]),
      amountMinor: z.number().int().positive(),
      currency: z.string().length(3).toUpperCase(),
    }),
    flightsReserveMinor: z.number().int().min(0).optional(),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: "checkOut must be after checkIn" });

export type TripRequest = z.infer<typeof tripRequestSchema>;

export type DraftOutcome =
  | { status: "drafted"; itinerary: Itinerary; fit: AssembleResult["fit"] }
  | { status: "infeasible"; reason: "budget_below_reserve" | "no_days" }
  | { status: "planner_failed"; reason: "malformed_output" | "no_proposals" };

function tripDayCount(checkIn: string, checkOut: string): number {
  return Math.max(1, Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000));
}

/** Tool executors closing over the composition root's ports (research D7). */
export function plannerToolDeps(container: Container): PlannerToolDeps {
  return {
    searchHotelRates: (c) => container.hotel.search(c),
    searchActivities: (c) => container.activity.search(c),
    quoteTransfer: (c) => container.transfer.search(c),
    quoteCarRental: (c) => container.carRental.search(c),
  };
}

/**
 * Re-read the supply catalog with canonical criteria derived from the trip
 * request. This is the verification truth (FR-003): a proposal referencing an
 * offer this sweep does not return is dropped. The same sweep re-registers
 * sandbox offers idempotently, which the quote flow reuses (research D6).
 */
export async function verifiedSupplyCatalog(
  container: Container,
  req: Pick<TripRequest, "destination" | "checkIn" | "checkOut" | "party">,
): Promise<VerifiedOffer[]> {
  const guests = req.party.adults + req.party.children;
  const airport = `${req.destination} Airport`;
  const [hotels, activities, transfers] = await Promise.all([
    container.hotel.search({
      destination: req.destination,
      checkIn: req.checkIn,
      checkOut: req.checkOut,
      guests,
    }),
    container.activity.search({ destination: req.destination, participants: guests }),
    container.transfer.search({
      from: airport,
      to: req.destination,
      at: `${req.checkIn}T10:00:00Z`,
      passengers: guests,
    }),
  ]);
  return [
    ...hotels.map<VerifiedOffer>((o) => ({
      port: "hotel",
      offerId: o.offerId,
      title: o.content.title,
      netRate: o.netRate,
    })),
    ...activities.map<VerifiedOffer>((o) => ({
      port: "activity",
      offerId: o.offerId,
      title: o.content.title,
      netRate: o.netRate,
      durationMinutes: o.durationMinutes,
    })),
    ...transfers.map<VerifiedOffer>((o) => ({
      port: "transfer",
      offerId: o.offerId,
      title: o.content.title,
      netRate: o.netRate,
      mode: o.mode,
    })),
  ];
}

export async function draftItinerary(
  container: Container,
  session: AgentSessionContext,
  input: TripRequest,
): Promise<DraftOutcome> {
  const db = container.db;
  if (!db) {
    throw new Error("database not configured");
  }

  const days = tripDayCount(input.checkIn, input.checkOut);
  const allocation = allocateBudget({
    totalMinor: input.budget.amountMinor,
    currency: input.budget.currency,
    mode: input.budget.mode,
    tripStyle: input.tripStyle,
    days,
    flightsReserveMinor: input.flightsReserveMinor,
  });
  if (allocation.status === "infeasible") {
    return { status: "infeasible", reason: allocation.reason };
  }
  const allocatedMinor = (category: string): number =>
    allocation.allocations.find((a) => a.category === category)?.allocated.amountMinor ?? 0;

  const drafted = await container.llm.draftItinerary({
    purpose: "planner.draft",
    request: {
      destination: input.destination,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      party: input.party,
      tripStyle: input.tripStyle,
      currency: input.budget.currency,
      budgets: {
        accommodationMinor: allocatedMinor("accommodation"),
        activitiesMinor: allocatedMinor("activities"),
        localTransportMinor: allocatedMinor("localTransport"),
      },
    },
    tools: plannerToolDeps(container),
  });
  if (drafted.status === "failed") {
    return { status: "planner_failed", reason: drafted.reason };
  }

  const offers = await verifiedSupplyCatalog(container, input);
  const id = randomUUID();
  const assembled = assembleItinerary({
    request: {
      id,
      agencyId: session.agencyId,
      currency: input.budget.currency,
      destination: input.destination,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      party: input.party,
      mode: input.budget.mode,
    },
    title: drafted.draft.title,
    draftDays: drafted.draft.days.map<DraftDayProposal>((d) => ({ items: d.items })),
    offers,
    allocations: allocation.allocations,
    rates: container.rates,
  });

  // A draft whose every proposal was dropped is not a plan (INV-014) — fail
  // typed with zero writes rather than persist an empty shell.
  const itemCount = assembled.itinerary.days.reduce((acc, d) => acc + d.items.length, 0);
  if (itemCount === 0) {
    return { status: "planner_failed", reason: "no_proposals" };
  }

  const document = stampProvenance(assembled.itinerary, session.agencyId);

  await db.transaction(async (tx) => {
    await tx.insert(itineraryTable).values({
      id,
      agencyId: session.agencyId,
      title: document.title,
      currency: document.currency,
      document,
      tripRequest: input,
    });
    await recordPmfEvent(tx, {
      type: "trip_created",
      agencyId: session.agencyId,
      itineraryId: id,
      source: "self_built",
      actorUserId: session.userId,
    });
  });

  return { status: "drafted", itinerary: document, fit: assembled.fit };
}
