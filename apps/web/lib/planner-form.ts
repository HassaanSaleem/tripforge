// Pure view logic for the workspace planner (spec 008 research D6/D7): form →
// trip-request mapping with pre-submit validation, failure → human-readable
// message mapping, and minor-unit display formatting. DOM-free so it runs under
// the root Vitest node environment; the component may only display strings that
// come from here (contract §2.3). The server stays authoritative — these checks
// exist for immediate feedback, not enforcement (INV-023).
import { transportErrorMessage } from "./transport-error.js";
import type { DraftInput, DraftOutput } from "./trpc/client.js";

/** Raw controlled-input values (strings as the inputs hold them). */
export interface PlannerFormValues {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: string;
  children: string;
  tripStyle: "" | "balanced" | "budget" | "premium";
  budgetMajor: string;
  budgetMode: "hardCap" | "target";
  currency: string;
}

type TripRequestMapping = { request: DraftInput } | { error: string };

/** A seeded, human-facing destination the planner's picker offers (spec 018 FR-004). */
export interface HeroDestination {
  id: string;
  city: string;
  country: string;
  flag: string;
  /** CSS `background` value — gradient only, never a photo (spec 018 Assumptions). */
  gradient: string;
}

/**
 * Static seed set for the destination picker and the drafted-result hero card
 * (spec 018 US2/US3). Deliberately hardcoded, not backend-fetched: the demo
 * image/catalog seed ticket (demo-01-seed) has not landed, and this is a
 * presentation-only feature (FR-009) — swapping in real catalog data later is
 * a separate change.
 */
export const HERO_DESTINATIONS: HeroDestination[] = [
  {
    id: "lisbon",
    city: "Lisbon",
    country: "Portugal",
    flag: "🇵🇹",
    gradient: "linear-gradient(135deg, #f2a65a, var(--coral) 55%, #8e4b6e)",
  },
  {
    id: "tokyo",
    city: "Tokyo",
    country: "Japan",
    flag: "🇯🇵",
    gradient: "linear-gradient(135deg, var(--coral) 0%, #b3477a 50%, var(--sea-deep) 100%)",
  },
  {
    id: "marrakech",
    city: "Marrakech",
    country: "Morocco",
    flag: "🇲🇦",
    gradient: "linear-gradient(135deg, var(--gold), var(--coral-deep) 60%, #7a3b2e)",
  },
  {
    id: "reykjavik",
    city: "Reykjavik",
    country: "Iceland",
    flag: "🇮🇸",
    gradient: "linear-gradient(135deg, var(--sea-tint), var(--sea) 55%, var(--sea-deep))",
  },
];

const DEFAULT_DESTINATION_TREATMENT = {
  flag: "🌍",
  gradient: "linear-gradient(135deg, var(--sand-2), var(--sea-tint))",
};

/**
 * Resolves the image-forward visual treatment for a destination string —
 * used by both the picker (per-option swatch) and the drafted-result hero
 * card, so a seeded destination looks the same in both places (spec 018
 * research.md Decision 3). Total function: always returns a value, matched
 * or not, and never touches the network. Matches by substring (not just
 * exact equality) so it resolves both a bare destination value ("Lisbon,
 * Portugal") and a generated itinerary title that embeds it ("Lisbon
 * balanced trip", per packages/llm/src/fake.ts's title template).
 */
export function resolveDestinationTreatment(destination: string): { flag: string; gradient: string } {
  const normalized = destination.trim().toLowerCase();
  const match = HERO_DESTINATIONS.find((hero) => normalized.includes(hero.city.toLowerCase()));
  return match ? { flag: match.flag, gradient: match.gradient } : DEFAULT_DESTINATION_TREATMENT;
}

/** Plain-language label for each server-accepted `budgetMode` value (spec 018 FR-001) — no raw enum text reaches the UI. */
export const BUDGET_MODE_LABELS: Record<PlannerFormValues["budgetMode"], string> = {
  hardCap: "Hard cap",
  target: "Target budget",
};

/** Plain-language label for each server-accepted `tripStyle` value (spec 018 FR-002) — the empty string keeps its own explicit UI label. */
export const TRIP_STYLE_LABELS: Record<Exclude<PlannerFormValues["tripStyle"], "">, string> = {
  budget: "Budget-savvy",
  balanced: "Balanced",
  premium: "Premium",
};

/**
 * Fraction digits for an ISO currency (EUR → 2, JPY → 0), from Intl metadata.
 * Falls back to 2 for anything Intl refuses — the server independently
 * validates the currency code.
 */
export function currencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/**
 * Display formatting of an EXACT server minor-unit integer (FR-009/SC-004):
 * `250000, "EUR" → "2,500.00 EUR"`. Locale pinned to `en` so output is
 * deterministic across machines. This is the only money rendering path; no
 * arithmetic happens on money anywhere else in the web app.
 */
export function formatMinorAmount(amountMinor: number, currency: string): string {
  const digits = currencyFractionDigits(currency);
  const major = amountMinor / 10 ** digits;
  const formatted = new Intl.NumberFormat("en", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(major);
  return `${formatted} ${currency}`;
}

/**
 * Map raw form values to the draft procedure's input, or a human-readable
 * refusal (never throws). Mirrors the server contract's checks that a user can
 * fix pre-submit (dates ordered, positive budget, party size); converts the
 * major-unit budget to integer minor units exactly once (research D7).
 */
export function toTripRequest(values: PlannerFormValues): TripRequestMapping {
  const destination = values.destination.trim();
  if (!destination) {
    return { error: "Enter a destination." };
  }
  if (!values.checkIn || !values.checkOut) {
    return { error: "Choose both check-in and check-out dates." };
  }
  if (values.checkOut <= values.checkIn) {
    return { error: "Check-out must be after check-in." };
  }
  const adults = Number(values.adults);
  if (!Number.isInteger(adults) || adults < 1) {
    return { error: "Adults must be a whole number of at least 1." };
  }
  const children = values.children.trim() === "" ? 0 : Number(values.children);
  if (!Number.isInteger(children) || children < 0) {
    return { error: "Children must be a whole number of 0 or more." };
  }
  const currency = values.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: "Currency must be a 3-letter code (e.g. EUR)." };
  }
  const budgetMajor = Number(values.budgetMajor);
  if (!Number.isFinite(budgetMajor) || budgetMajor <= 0) {
    return { error: "Enter a budget greater than zero." };
  }
  const amountMinor = Math.round(budgetMajor * 10 ** currencyFractionDigits(currency));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { error: "Enter a budget greater than zero." };
  }

  return {
    request: {
      destination,
      checkIn: values.checkIn,
      checkOut: values.checkOut,
      party: { adults, children },
      ...(values.tripStyle === "" ? {} : { tripStyle: values.tripStyle }),
      budget: { mode: values.budgetMode, amountMinor, currency },
    },
  };
}

type NonDraftedOutcome = Exclude<DraftOutput, { status: "drafted" }>;

/**
 * One distinct human-readable message per typed business failure (FR-006,
 * data-model mapping table). Exhaustive over the outcome union — a new server
 * reason fails compilation here instead of leaking raw text to the page.
 */
export function draftFailureMessage(outcome: NonDraftedOutcome): string {
  switch (outcome.status) {
    case "infeasible":
      return outcome.reason === "budget_below_reserve"
        ? "This budget is below the trip's flights reserve. Raise the budget or lower the reserve, then try again."
        : "The selected dates leave no plannable days. Check that check-out is after check-in.";
    case "planner_failed":
      return outcome.reason === "malformed_output"
        ? "The planner could not produce a usable plan this time. Please try again."
        : "No bookable options fit this trip and budget. Try adjusting the budget, dates, or destination.";
  }
}

/**
 * One human-readable message per transport/authorization failure (FR-007,
 * data-model mapping table). Never returns raw error text.
 */
export function draftErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Drafting requires an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the trip details. Please check the form values and try again.",
  });
}
