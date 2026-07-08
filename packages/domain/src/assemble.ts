// Deterministic assembly (spec 005 FR-003/004/005; INV-014/015): turns a
// planner PROPOSAL into a canonical Itinerary whose every price comes from a
// re-verified supply offer — never from generated text. The AI proposes;
// this function guarantees: unknown offers are dropped, every amount is
// converted to the itinerary currency with an explicit rate, category caps
// are enforced (re-balancing buffer-first, never the flights reserve), a
// hard-cap budget is never exceeded, and the result parses against the
// canonical schema before it leaves.
//
// Input shapes are plain domain data. The api layer adapts the llm package's
// PlannerDraft into these (domain imports no adapters or llm — INV-017); the
// proposal vocabulary is offer references only, so nothing here is an
// itinerary-shaped fork (INV-001).
import { ItinerarySchema, type BudgetAllocation, type Day, type Item, type Itinerary } from "@tripforge/itinerary-schema";
import { convertMoney, MoneyError, type ExchangeRate, type Money } from "./money.js";
import {
  allocationsTotalMinor,
  categoryForPort,
  rebalanceAllocations,
  type RebalanceMove,
} from "./budget.js";

export type DraftPort = "hotel" | "activity" | "transfer";

export interface DraftItemProposal {
  port: DraftPort;
  offerId: string;
  /** Optional activity start hint (ISO datetime). */
  startsAt?: string;
}

export interface DraftDayProposal {
  items: DraftItemProposal[];
}

/** A supply offer re-read from its port at assembly time (the verified catalog). */
export interface VerifiedOffer {
  port: DraftPort;
  offerId: string;
  title: string;
  netRate: Money;
  /** transfer offers */
  mode?: "private" | "shared";
  /** activity offers */
  durationMinutes?: number;
}

export interface AssembleRequest {
  /** Caller-generated itinerary id (uuid) — equals the persisted row id. */
  id: string;
  agencyId: string;
  currency: string;
  destination: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  party: { adults: number; children: number };
  mode: "hardCap" | "target";
}

export interface CategoryFit {
  category: BudgetAllocation["category"];
  allocatedMinor: number;
  spentMinor: number;
  state: "fits" | "underFilled" | "overTarget";
}

export interface DroppedProposal {
  port: DraftPort;
  offerId: string;
  reason: "unknown_offer" | "no_rate" | "over_budget";
}

export interface AssembleResult {
  itinerary: Itinerary;
  fit: { categories: CategoryFit[]; rebalances: RebalanceMove[] };
  dropped: DroppedProposal[];
}

function isoDatePlusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function findRate(rates: readonly ExchangeRate[], from: string, to: string): ExchangeRate | undefined {
  return rates.find((r) => r.from === from && r.to === to);
}

export function assembleItinerary(args: {
  request: AssembleRequest;
  title: string;
  draftDays: DraftDayProposal[];
  offers: VerifiedOffer[];
  allocations: BudgetAllocation[];
  rates: readonly ExchangeRate[];
}): AssembleResult {
  const { request, title, draftDays, offers, rates } = args;
  const offerByKey = new Map(offers.map((o) => [`${o.port}:${o.offerId}`, o]));

  let allocations = args.allocations.map((a) => ({ ...a }));
  const totalBefore = allocationsTotalMinor(allocations);
  const spent: Partial<Record<BudgetAllocation["category"], number>> = {};
  const underFilled = new Set<BudgetAllocation["category"]>();
  const rebalances: RebalanceMove[] = [];
  const dropped: DroppedProposal[] = [];
  const days: Day[] = [];
  let transferLegCount = 0;

  draftDays.forEach((draftDay, dayIndex) => {
    const dayNumber = dayIndex + 1;
    const items: Item[] = [];

    draftDay.items.forEach((proposal, itemIndex) => {
      const offer = offerByKey.get(`${proposal.port}:${proposal.offerId}`);
      if (!offer) {
        dropped.push({ port: proposal.port, offerId: proposal.offerId, reason: "unknown_offer" });
        return;
      }

      // Explicit conversion into the itinerary currency (INV-009, FR-008).
      let priced: Money;
      if (offer.netRate.currency === request.currency) {
        priced = offer.netRate;
      } else {
        const rate = findRate(rates, offer.netRate.currency, request.currency);
        if (!rate) {
          dropped.push({ port: proposal.port, offerId: proposal.offerId, reason: "no_rate" });
          return;
        }
        try {
          priced = convertMoney(offer.netRate, rate);
        } catch (err) {
          if (err instanceof MoneyError) {
            dropped.push({ port: proposal.port, offerId: proposal.offerId, reason: "no_rate" });
            return;
          }
          throw err;
        }
      }

      // Fit within the category allocation; re-balance exact headroom on
      // overrun (buffer first, never the flights reserve — FR-005).
      const category = categoryForPort(proposal.port);
      const allocated = allocations.find((a) => a.category === category);
      const spentSoFar = spent[category] ?? 0;
      const remaining = (allocated?.allocated.amountMinor ?? 0) - spentSoFar;
      if (priced.amountMinor > remaining) {
        const rebalance = rebalanceAllocations(allocations, spent, category, priced.amountMinor - remaining);
        if (rebalance.remainingDeficitMinor === 0) {
          allocations = rebalance.allocations;
          rebalances.push(...rebalance.moves);
        } else if (request.mode === "hardCap") {
          dropped.push({ port: proposal.port, offerId: proposal.offerId, reason: "over_budget" });
          underFilled.add(category);
          return;
        } else {
          // target mode: include it and show the overshoot honestly (US4) —
          // the category fit state below derives overTarget from spent > allocated.
          allocations = rebalance.allocations;
          rebalances.push(...rebalance.moves);
        }
      }

      spent[category] = spentSoFar + priced.amountMinor;
      const id = `d${dayNumber}-i${itemIndex + 1}`;
      const pricing = { netRate: priced, sellPrice: priced }; // markup applies at quote time (FR-007)
      const supplyRef = { port: proposal.port, externalId: proposal.offerId };

      if (proposal.port === "hotel") {
        items.push({
          kind: "stay",
          id,
          title: offer.title,
          supplyRef,
          media: [],
          pricing,
          checkIn: request.checkIn,
          checkOut: request.checkOut,
          occupancy: { adults: request.party.adults, children: request.party.children },
        });
      } else if (proposal.port === "activity") {
        items.push({
          kind: "activity",
          id,
          title: offer.title,
          supplyRef,
          media: [],
          pricing,
          startsAt: proposal.startsAt,
          durationMinutes: offer.durationMinutes,
        });
      } else {
        // Deterministic legs: odd transfers arrive (airport → destination),
        // even transfers depart (destination → airport).
        transferLegCount += 1;
        const airport = `${request.destination} Airport`;
        const arriving = transferLegCount % 2 === 1;
        items.push({
          kind: "transfer",
          id,
          title: offer.title,
          supplyRef,
          media: [],
          pricing,
          from: arriving ? airport : request.destination,
          to: arriving ? request.destination : airport,
          mode: offer.mode ?? "other",
        });
      }
    });

    const subtotalMinor = items.reduce((acc, it) => acc + (it.pricing?.sellPrice.amountMinor ?? 0), 0);
    days.push({
      dayNumber,
      date: isoDatePlusDays(request.checkIn, dayIndex),
      subtotal: { amountMinor: subtotalMinor, currency: request.currency },
      items,
    });
  });

  if (allocationsTotalMinor(allocations) !== totalBefore) {
    // Re-balancing is transfer-only; a changed total is a construction bug.
    throw new MoneyError("allocation total changed during assembly — conservation violated");
  }

  const categories: CategoryFit[] = allocations.map((a) => {
    const spentMinor = spent[a.category] ?? 0;
    const state: CategoryFit["state"] = underFilled.has(a.category)
      ? "underFilled"
      : spentMinor > a.allocated.amountMinor
        ? "overTarget"
        : "fits";
    return { category: a.category, allocatedMinor: a.allocated.amountMinor, spentMinor, state };
  });

  const itinerary = ItinerarySchema.parse({
    id: request.id,
    agencyId: request.agencyId,
    title,
    currency: request.currency,
    days,
    media: [],
    pricing: {
      budgetMode: request.mode,
      total: { amountMinor: totalBefore, currency: request.currency },
      categories: allocations.map((a) => ({
        category: a.category,
        allocated: a.allocated,
        spent: { amountMinor: spent[a.category] ?? 0, currency: request.currency },
      })),
    },
    provenance: { rebrandLineage: [] },
  });

  return { itinerary, fit: { categories, rebalances }, dropped };
}
