// Chat-driven itinerary editing (spec 020 FR-001..FR-010): applies ONE
// concrete edit (remove an existing item, or add a freshly-verified item) to
// an ALREADY-ASSEMBLED canonical Itinerary, re-deriving the budget-fit block
// with the SAME rebalancing rules assembleItinerary uses (buffer-donor-first,
// flights reserve never a donor, hardCap never exceeded). Items already carry
// a stable `id` (itinerary-schema/item.ts) — no schema change, no migration
// (INV-001/Constitution IV). A hotel add when a stay already exists replaces
// it (research.md D6: v0 itineraries are single-hotel trips throughout the
// existing assembly logic).
import {
  ItinerarySchema,
  type BudgetCategory,
  type Day,
  type Item,
  type Itinerary,
} from "@tripforge/itinerary-schema";
import { convertMoney, MoneyError, type ExchangeRate, type Money } from "./money.js";
import { allocationsTotalMinor, categoryForPort, rebalanceAllocations, type RebalanceMove } from "./budget.js";
import type { CategoryFit, DraftPort, VerifiedOffer } from "./assemble.js";

export type ItineraryEditProposal =
  | { type: "removeItem"; itemId: string }
  | { type: "addItem"; dayNumber: number; port: DraftPort; offerId: string; startsAt?: string };

export type ApplyEditOutcome =
  | "applied"
  | "item_not_found"
  | "unknown_offer"
  | "no_rate"
  | "invalid_day"
  | "empty_result"
  | "over_budget";

export interface ApplyEditResult {
  itinerary: Itinerary;
  fit: { categories: CategoryFit[]; rebalances: RebalanceMove[] };
  outcome: ApplyEditOutcome;
}

export interface ApplyItineraryEditArgs {
  itinerary: Itinerary;
  edit: ItineraryEditProposal;
  /** Freshly re-verified supply offers — the only source of truth for price/title (FR-006/FR-012). */
  offers: VerifiedOffer[];
  rates: readonly ExchangeRate[];
  mode: "hardCap" | "target";
  /** Trip-level context for constructing a brand-new stay/transfer item (unused by removeItem). */
  checkIn: string;
  checkOut: string;
  party: { adults: number; children: number };
  destination: string;
}

function portOfItem(item: Item): DraftPort {
  switch (item.kind) {
    case "stay":
      return "hotel";
    case "activity":
      return "activity";
    case "transfer":
      return "transfer";
  }
}

function recomputeDaySubtotals(days: Day[], currency: string): Day[] {
  return days.map((day) => ({
    ...day,
    subtotal: {
      amountMinor: day.items.reduce((acc, item) => acc + (item.pricing?.sellPrice.amountMinor ?? 0), 0),
      currency,
    },
  }));
}

function categoryFitState(spentMinor: number, allocatedMinor: number): CategoryFit["state"] {
  return spentMinor > allocatedMinor ? "overTarget" : "fits";
}

/** The document's fit as currently stored — used on every no-op/refused path so callers always get a valid fit block. */
function currentFit(itinerary: Itinerary): { categories: CategoryFit[]; rebalances: RebalanceMove[] } {
  const categories: CategoryFit[] = itinerary.pricing.categories.map((c) => {
    const spentMinor = c.spent?.amountMinor ?? 0;
    return {
      category: c.category,
      allocatedMinor: c.allocated.amountMinor,
      spentMinor,
      state: categoryFitState(spentMinor, c.allocated.amountMinor),
    };
  });
  return { categories, rebalances: [] };
}

function applyRemove(itinerary: Itinerary, itemId: string): ApplyEditResult {
  let found: Item | undefined;
  const days = itinerary.days.map((day) => ({
    ...day,
    items: day.items.filter((item) => {
      if (item.id !== itemId) return true;
      found = item;
      return false;
    }),
  }));
  if (!found) {
    return { itinerary, fit: currentFit(itinerary), outcome: "item_not_found" };
  }
  const removedItem = found;

  const totalItemsRemaining = days.reduce((acc, d) => acc + d.items.length, 0);
  if (totalItemsRemaining === 0) {
    return { itinerary, fit: currentFit(itinerary), outcome: "empty_result" };
  }

  const category = categoryForPort(portOfItem(removedItem));
  const removedMinor = removedItem.pricing?.sellPrice.amountMinor ?? 0;
  const categories = itinerary.pricing.categories.map((c) =>
    c.category === category
      ? { ...c, spent: { amountMinor: Math.max(0, (c.spent?.amountMinor ?? 0) - removedMinor), currency: itinerary.currency } }
      : c,
  );
  const recomputedDays = recomputeDaySubtotals(days, itinerary.currency);

  const document = ItinerarySchema.parse({
    ...itinerary,
    days: recomputedDays,
    pricing: { ...itinerary.pricing, categories },
  });
  const fitCategories: CategoryFit[] = categories.map((c) => {
    const spentMinor = c.spent?.amountMinor ?? 0;
    return {
      category: c.category,
      allocatedMinor: c.allocated.amountMinor,
      spentMinor,
      state: categoryFitState(spentMinor, c.allocated.amountMinor),
    };
  });
  return { itinerary: document, fit: { categories: fitCategories, rebalances: [] }, outcome: "applied" };
}

function buildItem(
  port: DraftPort,
  offer: VerifiedOffer,
  priced: Money,
  id: string,
  ctx: {
    checkIn: string;
    checkOut: string;
    party: { adults: number; children: number };
    destination: string;
    existingTransferCount: number;
    startsAt?: string;
  },
): Item {
  const supplyRef = { port, externalId: offer.offerId };
  const pricing = { netRate: priced, sellPrice: priced };
  if (port === "hotel") {
    return {
      kind: "stay",
      id,
      title: offer.title,
      supplyRef,
      media: [],
      pricing,
      checkIn: ctx.checkIn,
      checkOut: ctx.checkOut,
      occupancy: { adults: ctx.party.adults, children: ctx.party.children },
    };
  }
  if (port === "activity") {
    return {
      kind: "activity",
      id,
      title: offer.title,
      supplyRef,
      media: [],
      pricing,
      startsAt: ctx.startsAt,
      durationMinutes: offer.durationMinutes,
    };
  }
  const airport = `${ctx.destination} Airport`;
  const arriving = (ctx.existingTransferCount + 1) % 2 === 1;
  return {
    kind: "transfer",
    id,
    title: offer.title,
    supplyRef,
    media: [],
    pricing,
    from: arriving ? airport : ctx.destination,
    to: arriving ? ctx.destination : airport,
    mode: offer.mode ?? "other",
  };
}

/** Next unique item id for `dayNumber`, scanning the WHOLE document (not just
 * the target day) so a prior removal never leaves a reusable gap that could
 * collide with a still-present sibling's id. Deterministic — no randomness. */
function nextItemId(days: readonly Day[], dayNumber: number): string {
  const prefix = `d${dayNumber}-i`;
  let maxIndex = 0;
  for (const day of days) {
    for (const item of day.items) {
      if (!item.id.startsWith(prefix)) continue;
      const n = Number.parseInt(item.id.slice(prefix.length), 10);
      if (Number.isInteger(n) && n > maxIndex) maxIndex = n;
    }
  }
  return `${prefix}${maxIndex + 1}`;
}

function applyAdd(
  itinerary: Itinerary,
  edit: Extract<ItineraryEditProposal, { type: "addItem" }>,
  offers: VerifiedOffer[],
  rates: readonly ExchangeRate[],
  mode: "hardCap" | "target",
  ctx: { checkIn: string; checkOut: string; party: { adults: number; children: number }; destination: string },
): ApplyEditResult {
  const targetDay = itinerary.days.find((d) => d.dayNumber === edit.dayNumber);
  if (!targetDay) {
    return { itinerary, fit: currentFit(itinerary), outcome: "invalid_day" };
  }
  const offer = offers.find((o) => o.port === edit.port && o.offerId === edit.offerId);
  if (!offer) {
    return { itinerary, fit: currentFit(itinerary), outcome: "unknown_offer" };
  }

  let priced: Money;
  if (offer.netRate.currency === itinerary.currency) {
    priced = offer.netRate;
  } else {
    const rate = rates.find((r) => r.from === offer.netRate.currency && r.to === itinerary.currency);
    if (!rate) {
      return { itinerary, fit: currentFit(itinerary), outcome: "no_rate" };
    }
    try {
      priced = convertMoney(offer.netRate, rate);
    } catch (err) {
      if (err instanceof MoneyError) {
        return { itinerary, fit: currentFit(itinerary), outcome: "no_rate" };
      }
      throw err;
    }
  }

  // Hotel-replaces-existing-stay (research.md D6): v0 trips are single-hotel.
  let days = itinerary.days;
  let removedStayMinor = 0;
  if (edit.port === "hotel") {
    const existingStay = days.flatMap((d) => d.items).find((it) => it.kind === "stay");
    if (existingStay) {
      removedStayMinor = existingStay.pricing?.sellPrice.amountMinor ?? 0;
      days = days.map((d) => ({ ...d, items: d.items.filter((it) => it.id !== existingStay.id) }));
    }
  }

  const category = categoryForPort(edit.port);
  const spentByCategory: Partial<Record<BudgetCategory, number>> = {};
  for (const c of itinerary.pricing.categories) {
    spentByCategory[c.category] = c.spent?.amountMinor ?? 0;
  }
  if (removedStayMinor > 0) {
    const stayCategory = categoryForPort("hotel");
    spentByCategory[stayCategory] = Math.max(0, (spentByCategory[stayCategory] ?? 0) - removedStayMinor);
  }

  let allocations = itinerary.pricing.categories.map((c) => ({ category: c.category, allocated: c.allocated }));
  const totalBefore = allocationsTotalMinor(allocations);
  let rebalances: RebalanceMove[] = [];
  const spentSoFar = spentByCategory[category] ?? 0;
  const allocatedForCategory = allocations.find((a) => a.category === category)?.allocated.amountMinor ?? 0;
  const remaining = allocatedForCategory - spentSoFar;
  if (priced.amountMinor > remaining) {
    const rebalance = rebalanceAllocations(allocations, spentByCategory, category, priced.amountMinor - remaining);
    if (rebalance.remainingDeficitMinor === 0) {
      allocations = rebalance.allocations;
      rebalances = rebalance.moves;
    } else if (mode === "hardCap") {
      return { itinerary, fit: currentFit(itinerary), outcome: "over_budget" };
    } else {
      allocations = rebalance.allocations;
      rebalances = rebalance.moves;
    }
  }
  if (allocationsTotalMinor(allocations) !== totalBefore) {
    // Re-balancing is transfer-only; a changed total is a construction bug (mirrors assembleItinerary's own guard).
    throw new MoneyError("allocation total changed during edit application — conservation violated");
  }
  spentByCategory[category] = spentSoFar + priced.amountMinor;

  const existingTransferCount = days.flatMap((d) => d.items).filter((it) => it.kind === "transfer").length;
  const id = nextItemId(days, edit.dayNumber);
  const newItem = buildItem(edit.port, offer, priced, id, {
    checkIn: ctx.checkIn,
    checkOut: ctx.checkOut,
    party: ctx.party,
    destination: ctx.destination,
    existingTransferCount,
    startsAt: edit.startsAt,
  });
  const updatedDays = days.map((d) => (d.dayNumber === edit.dayNumber ? { ...d, items: [...d.items, newItem] } : d));
  const recomputedDays = recomputeDaySubtotals(updatedDays, itinerary.currency);

  const categories = allocations.map((a) => ({
    category: a.category,
    allocated: a.allocated,
    spent: { amountMinor: spentByCategory[a.category] ?? 0, currency: itinerary.currency },
  }));
  const document = ItinerarySchema.parse({
    ...itinerary,
    days: recomputedDays,
    pricing: { budgetMode: mode, total: { amountMinor: totalBefore, currency: itinerary.currency }, categories },
  });
  const fitCategories: CategoryFit[] = allocations.map((a) => {
    const spentMinor = spentByCategory[a.category] ?? 0;
    return { category: a.category, allocatedMinor: a.allocated.amountMinor, spentMinor, state: categoryFitState(spentMinor, a.allocated.amountMinor) };
  });
  return { itinerary: document, fit: { categories: fitCategories, rebalances }, outcome: "applied" };
}

export function applyItineraryEdit(args: ApplyItineraryEditArgs): ApplyEditResult {
  const { itinerary, edit, offers, rates, mode, checkIn, checkOut, party, destination } = args;
  if (edit.type === "removeItem") {
    return applyRemove(itinerary, edit.itemId);
  }
  return applyAdd(itinerary, edit, offers, rates, mode, { checkIn, checkOut, party, destination });
}
