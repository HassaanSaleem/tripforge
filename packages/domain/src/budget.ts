// Budget allocator (spec 005 FR-001/002/005; INV-015): a pure, deterministic
// function of the trip request. Splits a total budget across the five canonical
// categories in exact integer minor units (conservation via
// splitByWeightsMinorUnits) using trip-style band profiles inside the PRD §9.2
// bands. flightsTransport is the RESERVE anchor at P0 (INV-008/022): no live
// lookup prices against it and re-balancing never uses it as a donor —
// consuming it would fabricate budget the flights will still need.
import type { BudgetAllocation, BudgetCategory } from "@tripforge/itinerary-schema";
import { money, splitByWeightsMinorUnits, MoneyError } from "./money.js";

/** Canonical category order — every allocation list uses it. */
export const BUDGET_CATEGORIES: readonly BudgetCategory[] = [
  "flightsTransport",
  "accommodation",
  "activities",
  "localTransport",
  "buffer",
];

export type TripStyle = "balanced" | "budget" | "premium";

// Integer weights summing to 100, each inside its PRD band
// (flights 35–45, accommodation 30–40, activities 10–15, local 5–10, buffer 5–10).
const BAND_PROFILES: Record<TripStyle, readonly number[]> = {
  balanced: [40, 35, 12, 7, 6],
  budget: [45, 30, 10, 7, 8],
  premium: [35, 40, 15, 5, 5],
};

export interface BudgetRequest {
  totalMinor: number;
  currency: string;
  mode: "hardCap" | "target";
  tripStyle?: TripStyle;
  days: number;
  /** Manual flights estimate (P0 anchor); overrides the band share when set. */
  flightsReserveMinor?: number;
}

export type AllocateBudgetResult =
  | { status: "allocated"; allocations: BudgetAllocation[] }
  | { status: "infeasible"; reason: "budget_below_reserve" | "no_days" };

export function allocateBudget(req: BudgetRequest): AllocateBudgetResult {
  if (!Number.isInteger(req.days) || req.days <= 0) {
    return { status: "infeasible", reason: "no_days" };
  }
  if (!Number.isInteger(req.totalMinor) || req.totalMinor <= 0) {
    throw new MoneyError(`total budget must be a positive integer minor amount, got ${req.totalMinor}`);
  }
  const weights = BAND_PROFILES[req.tripStyle ?? "balanced"];

  if (req.flightsReserveMinor !== undefined) {
    if (!Number.isInteger(req.flightsReserveMinor) || req.flightsReserveMinor < 0) {
      throw new MoneyError(`flights reserve must be a non-negative integer, got ${req.flightsReserveMinor}`);
    }
    const remaining = req.totalMinor - req.flightsReserveMinor;
    if (remaining < 0) {
      return { status: "infeasible", reason: "budget_below_reserve" };
    }
    const rest = splitByWeightsMinorUnits(money(remaining, req.currency), [...weights.slice(1)]);
    return {
      status: "allocated",
      allocations: [
        { category: "flightsTransport", allocated: money(req.flightsReserveMinor, req.currency) },
        ...zipAllocations(BUDGET_CATEGORIES.slice(1), rest),
      ],
    };
  }

  const split = splitByWeightsMinorUnits(money(req.totalMinor, req.currency), [...weights]);
  return { status: "allocated", allocations: zipAllocations(BUDGET_CATEGORIES, split) };
}

function zipAllocations(
  categories: readonly BudgetCategory[],
  amounts: readonly { amountMinor: number; currency: string }[],
): BudgetAllocation[] {
  return categories.map((category, i) => {
    const allocated = amounts[i];
    if (!allocated) {
      throw new MoneyError("allocation split arity mismatch");
    }
    return { category, allocated };
  });
}

// ─── Re-balancing (FR-005, US4) ───────────────────────────────────────────────

export interface RebalanceMove {
  from: BudgetCategory;
  to: BudgetCategory;
  amountMinor: number;
}

export interface RebalanceResult {
  allocations: BudgetAllocation[];
  moves: RebalanceMove[];
  /** Deficit still uncovered after every legal donor is exhausted. */
  remainingDeficitMinor: number;
}

// Donor priority: buffer exists to absorb overruns, then the categories a trip
// can most easily economize on. flightsTransport is NEVER a donor (the anchor).
const DONOR_ORDER: readonly BudgetCategory[] = ["buffer", "localTransport", "activities", "accommodation"];

/**
 * Move exact integer headroom into `deficitCategory` to cover `deficitMinor`.
 * A donor's headroom is `allocated − spent` (never below what it already
 * consumed); donors are drained in fixed priority order so the result is
 * deterministic and auditable via the returned move list. Conservation: the
 * allocation total is unchanged by construction (every move is a transfer).
 */
export function rebalanceAllocations(
  allocations: readonly BudgetAllocation[],
  spentByCategory: Partial<Record<BudgetCategory, number>>,
  deficitCategory: BudgetCategory,
  deficitMinor: number,
): RebalanceResult {
  if (!Number.isInteger(deficitMinor) || deficitMinor < 0) {
    throw new MoneyError(`deficit must be a non-negative integer, got ${deficitMinor}`);
  }
  if (deficitCategory === "flightsTransport") {
    throw new MoneyError("the flights/transport reserve is not an allocatable spend category (INV-008)");
  }
  const next = allocations.map((a) => ({ ...a }));
  const moves: RebalanceMove[] = [];
  let remaining = deficitMinor;

  for (const donor of DONOR_ORDER) {
    if (remaining === 0) break;
    if (donor === deficitCategory) continue;
    const entry = next.find((a) => a.category === donor);
    if (!entry) continue;
    const spent = spentByCategory[donor] ?? 0;
    const headroom = entry.allocated.amountMinor - spent;
    if (headroom <= 0) continue;
    const take = Math.min(headroom, remaining);
    entry.allocated = { amountMinor: entry.allocated.amountMinor - take, currency: entry.allocated.currency };
    const target = next.find((a) => a.category === deficitCategory);
    if (!target) {
      throw new MoneyError(`unknown deficit category ${deficitCategory}`);
    }
    target.allocated = { amountMinor: target.allocated.amountMinor + take, currency: target.allocated.currency };
    moves.push({ from: donor, to: deficitCategory, amountMinor: take });
    remaining -= take;
  }

  return { allocations: next, moves, remainingDeficitMinor: remaining };
}

/** Sum guard used by tests and callers: allocations must conserve the total. */
export function allocationsTotalMinor(allocations: readonly BudgetAllocation[]): number {
  return allocations.reduce((acc, a) => acc + a.allocated.amountMinor, 0);
}

/** The category an itinerary item's port spends against (FR-004 breakdown). */
export function categoryForPort(port: "hotel" | "activity" | "transfer"): BudgetCategory {
  switch (port) {
    case "hotel":
      return "accommodation";
    case "activity":
      return "activities";
    case "transfer":
      return "localTransport";
  }
}
