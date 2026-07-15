// Deterministic LLMPort fake (INV-013: "the test suite runs against deterministic
// fakes at the LLMPort boundary — no live provider or API key required"). Returns a
// scripted or echo response so planner tests are reproducible with zero network.
//
// The planner path (spec 005) is deterministic too: with no scripts, the fake
// drives the SAME injected tools the real planner would (search hotels /
// activities / transfers, price car-rental context) and proposes cheapest-first
// offers — so the keyless compose stack exercises the identical downstream
// pipeline (INV-019). Tests can script full DraftItineraryResult values to
// inject hallucinated offerIds, failures, or fail-book offers.
import {
  LLM_MODEL,
  type ChatEditProgressEvent,
  type ChatEditRequest,
  type DraftItineraryRequest,
  type DraftItineraryResult,
  type DraftProgressEvent,
  type InterpretTripRequestRequest,
  type LLMPort,
  type LlmCompleteRequest,
  type LlmCompleteResponse,
} from "./port.js";
import {
  DRAFT_VARIANTS,
  DRAFT_VARIANT_LABELS,
  type DraftVariant,
  type NamedPlannerDraft,
  type PlannerDraft,
  type PlannerDraftItem,
} from "./planner-draft.js";
import type { ChatEditResult, HotelSuggestion } from "./chat-edit.js";
import type { InterpretedTripParams, InterpretTripRequestResult } from "./interpret-trip-request.js";

const CURRENCY_SYMBOLS: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP" };

/** Deterministic destination extraction (spec 028, research.md D7) — text
 * following "in"/"to", cut at the next clause boundary. Operates on the
 * ORIGINAL-case message so a returned destination reads naturally (supply
 * search is case-insensitive at the sandbox layer). */
function extractDestination(raw: string): string | null {
  const match = raw.match(/\b(?:in|to)\s+([A-Za-z][A-Za-z\s'-]*?)(?=\s+for\b|\s+with\b|,|$)/i);
  const destination = match?.[1]?.trim();
  return destination && destination.length > 0 ? destination : null;
}

/** Deterministic budget extraction — currency symbol/code adjacent to an
 * amount, either order ("EUR2000", "$2000", "2000 EUR"). */
function extractBudget(text: string): { amount: number; currency: string } | null {
  const before = text.match(/(eur|usd|gbp|\$|€|£)\s*([\d,]+(?:\.\d+)?)/i);
  if (before?.[1] && before[2]) {
    const token = before[1].toLowerCase();
    const currency = CURRENCY_SYMBOLS[token] ?? token.toUpperCase();
    const amount = Number.parseFloat(before[2].replace(/,/g, ""));
    return Number.isFinite(amount) && amount > 0 ? { amount, currency } : null;
  }
  const after = text.match(/([\d,]+(?:\.\d+)?)\s*(eur|usd|gbp)\b/i);
  if (after?.[1] && after[2]) {
    const amount = Number.parseFloat(after[1].replace(/,/g, ""));
    const currency = after[2].toUpperCase();
    return Number.isFinite(amount) && amount > 0 ? { amount, currency } : null;
  }
  return null;
}

/** "N days"/"N nights" -> a nights count (days convert via days-1, min 1,
 * research.md D7); absent when the message states neither. */
function extractNights(text: string): number | null {
  const match = text.match(/(\d+)\s*(day|days|night|nights)\b/);
  if (!match?.[1] || !match[2]) return null;
  const count = Number.parseInt(match[1], 10);
  if (!Number.isFinite(count) || count <= 0) return null;
  const nights = match[2].startsWith("day") ? Math.max(1, count - 1) : count;
  return Math.min(30, nights);
}

/** "for N" (party size) — never matches when immediately followed by a
 * day/night unit, so "for 2 nights" isn't mistaken for 2 travelers. */
function extractAdults(text: string): number | null {
  const match = text.match(/\bfor\s+(\d+)\b(?!\s*(?:day|days|night|nights)\b)/);
  if (!match?.[1]) return null;
  const count = Number.parseInt(match[1], 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function extractTripStyle(text: string): "balanced" | "budget" | "premium" | null {
  if (/\b(boutique|luxury|upscale|premium)\b/.test(text)) return "premium";
  // Deliberately NOT bare "budget" — that word overwhelmingly names the
  // money amount ("budget of $3000"), not a style preference; only more
  // specific phrasing signals the budget-savvy STYLE.
  if (/\b(cheap|backpack|shoestring|budget-friendly|budget-savvy)\b/.test(text) || /\bon a budget\b/.test(text)) {
    return "budget";
  }
  return null;
}

export interface FakeLLMOptions {
  /** Canned complete() responses (consumed in order). */
  scripted?: string[];
  /** Canned draftItinerary() results (consumed in order); when exhausted or
   * absent, the deterministic tool-driven draft below is produced. */
  plannerScripts?: DraftItineraryResult[];
}

export class FakeLLM implements LLMPort {
  private readonly scripted: string[];
  private readonly plannerScripts: DraftItineraryResult[];
  public readonly calls: LlmCompleteRequest[] = [];
  public readonly draftCalls: DraftItineraryRequest[] = [];

  /** Provide canned responses (consumed in order); falls back to echoing the last user message. */
  constructor(scripted: string[] | FakeLLMOptions = []) {
    if (Array.isArray(scripted)) {
      this.scripted = [...scripted];
      this.plannerScripts = [];
    } else {
      this.scripted = [...(scripted.scripted ?? [])];
      this.plannerScripts = [...(scripted.plannerScripts ?? [])];
    }
  }

  async complete(req: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    this.calls.push(req);
    const next = this.scripted.shift();
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    const text = next ?? `echo:${lastUser?.content ?? ""}`;
    return {
      text,
      model: LLM_MODEL,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  async *draftItinerary(req: DraftItineraryRequest): AsyncGenerator<DraftProgressEvent> {
    this.draftCalls.push(req);
    const scripted = this.plannerScripts.shift();
    if (scripted) {
      yield { type: "result", result: scripted };
      return;
    }

    const { request, tools } = req;
    const guests = request.party.adults + request.party.children;
    const airport = `${request.destination} Airport`;

    // The same lookups the real planner performs, deterministically — run
    // SEQUENTIALLY (not Promise.all) so progress events have a stable,
    // observable order; this fake has no real network latency, so the change
    // has no cost. Final proposals/output are unaffected by the ordering.
    yield { type: "progress", step: "searchingHotels" };
    const hotels = await tools.searchHotelRates({
      destination: request.destination,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      guests,
    });
    yield { type: "progress", step: "searchingActivities" };
    const activities = await tools.searchActivities({ destination: request.destination, participants: guests });
    yield { type: "progress", step: "quotingTransfer" };
    const transfers = await tools.quoteTransfer({
      from: airport,
      to: request.destination,
      at: `${request.checkIn}T10:00:00Z`,
      passengers: guests,
    });
    // Car rental is price CONTEXT only (D-006): looked up, never proposed.
    yield { type: "progress", step: "quotingCarRental" };
    await tools.quoteCarRental({
      pickupLocation: airport,
      pickupAt: `${request.checkIn}T10:00:00Z`,
      dropoffAt: `${request.checkOut}T10:00:00Z`,
    });
    yield { type: "progress", step: "assembling" };

    const cheapest = <T extends { netRate: { amountMinor: number }; offerId: string }>(offers: T[]): T[] =>
      [...offers].sort((a, b) => a.netRate.amountMinor - b.netRate.amountMinor || a.offerId.localeCompare(b.offerId));
    const pickEnd = <T>(ranked: T[], end: "cheapest" | "priciest"): T | undefined =>
      end === "cheapest" ? ranked[0] : ranked[ranked.length - 1];

    const dayCount = Math.max(
      1,
      Math.round((Date.parse(`${request.checkOut}T00:00:00Z`) - Date.parse(`${request.checkIn}T00:00:00Z`)) / 86_400_000),
    );
    const rankedHotels = cheapest(hotels);
    // The transfer search's single response carries BOTH directions (the
    // planner tool boundary pins criteria to the trip's own canonical
    // direction — spec 008 FR-011 — so a second, reverse-direction call is
    // not possible; the sandbox surfaces the return leg in the same
    // response instead, offerId-suffixed `-return`). Reusing the arrival
    // offer verbatim on the departure day gave it the ARRIVAL direction's
    // own title ("X Airport → X") while assembleItinerary correctly flips
    // from/to for the second leg ("X → X Airport") — a title/route
    // mismatch (seed-0019). Picking the genuinely distinct return offer
    // fixes it; falls back to the arrival offer if none exists (e.g. a
    // real/live adapter that only ever returns one direction).
    const outboundTransfers = transfers.filter((t) => !t.offerId.endsWith("-return"));
    const returnTransfers = transfers.filter((t) => t.offerId.endsWith("-return"));
    const rankedOutbound = cheapest(outboundTransfers);
    const rankedAllTransfers = cheapest(transfers);
    const rankedReturn = cheapest(returnTransfers);
    const rankedActivities = cheapest(activities);

    if (rankedHotels.length === 0 && rankedActivities.length === 0 && rankedAllTransfers.length === 0) {
      yield { type: "result", result: { status: "failed", reason: "no_proposals" } };
      return;
    }

    // Which activity offer(s) land on a given day, per variant (spec 019
    // research.md D2) — all three variants share the SAME ranked activity
    // list from the ONE tool-lookup pass above; only the selection pattern
    // differs, so options stay mutually comparable at the same live prices.
    // `at` is always in-bounds (idx % length against a non-empty array) — the
    // undefined-filter below satisfies noUncheckedIndexedAccess without a
    // non-null assertion.
    function activitiesForDay(variant: DraftVariant, day: number): (typeof rankedActivities)[number][] {
      if (rankedActivities.length === 0) return [];
      const at = (idx: number) => rankedActivities[idx % rankedActivities.length];
      let picks: ((typeof rankedActivities)[number] | undefined)[];
      if (variant === "budgetSavvy") {
        // Fewer activities: only every other day.
        if (day % 2 === 0) return [];
        picks = [at(Math.floor((day - 1) / 2))];
      } else if (variant === "premium") {
        // One extra activity per day when the ranked list supports it.
        picks = rankedActivities.length < 2 ? [at(day - 1)] : [at(day - 1), at(day)];
      } else {
        // balanced — unchanged from the original single-draft selection.
        picks = [at(day - 1)];
      }
      return picks.filter((p): p is (typeof rankedActivities)[number] => p !== undefined);
    }

    function buildVariant(variant: DraftVariant): PlannerDraft {
      const end: "cheapest" | "priciest" = variant === "premium" ? "priciest" : "cheapest";
      const hotel = pickEnd(rankedHotels, end);
      const transfer = pickEnd(rankedOutbound, end) ?? pickEnd(rankedAllTransfers, end);
      const returnTransfer = pickEnd(rankedReturn, end) ?? transfer;

      const days: PlannerDraft["days"] = [];
      for (let day = 1; day <= dayCount; day++) {
        const items: PlannerDraftItem[] = [];
        if (day === 1) {
          if (transfer) items.push({ port: "transfer", offerId: transfer.offerId });
          if (hotel) items.push({ port: "hotel", offerId: hotel.offerId });
        }
        for (const activity of activitiesForDay(variant, day)) {
          items.push({ port: "activity", offerId: activity.offerId });
        }
        if (day === dayCount && dayCount > 1 && transfer) {
          items.push({ port: "transfer", offerId: (returnTransfer ?? transfer).offerId });
        }
        days.push({ items });
      }

      const title =
        variant === "balanced"
          ? `${request.destination} ${request.tripStyle ?? "balanced"} trip`
          : `${request.destination} ${DRAFT_VARIANT_LABELS[variant].toLowerCase()} trip`;
      return { title, days };
    }

    // Build in dedup-priority order — "balanced" is always kept (backward
    // compatible with the pre-spec-019 single-draft output); budgetSavvy/
    // premium are dropped when their day-by-day plan is byte-identical to
    // one already kept (FR-010: never show two indistinguishable options).
    const priority: DraftVariant[] = ["balanced", "budgetSavvy", "premium"];
    const seenSignatures: string[] = [];
    const kept: NamedPlannerDraft[] = [];
    for (const variant of priority) {
      const draft = buildVariant(variant);
      const signature = JSON.stringify(draft.days);
      if (variant === "balanced" || !seenSignatures.includes(signature)) {
        seenSignatures.push(signature);
        kept.push({ variant, draft });
      }
    }
    const drafts = DRAFT_VARIANTS.map((variant) => kept.find((k) => k.variant === variant)).filter(
      (d): d is NamedPlannerDraft => d !== undefined,
    );

    yield {
      type: "result",
      result: { status: "drafted", drafts, usage: { inputTokens: 0, outputTokens: 0 } },
    };
  }

  /** Deterministic keyword-rule chat-edit interpreter (spec 020, research.md
   * D7) — zero `Math.random()`, zero wall-clock read, same guarantee as
   * `draftItinerary` above. Runs the SAME injected tool executors real
   * planner tool loops use; never invents an offer. */
  async *chatEditItinerary(req: ChatEditRequest): AsyncGenerator<ChatEditProgressEvent> {
    yield { type: "progress", step: "interpreting" };
    const text = req.message.toLowerCase();
    const guests = req.party.adults + req.party.children;
    const usage = { inputTokens: 0, outputTokens: 0 };

    const clarify = (reply: string): ChatEditResult => ({ status: "interpreted", reply, edit: null, suggestions: [], usage });
    const CLARIFY_REPLY =
      'I can add an activity or transfer, remove an existing item by name, or suggest hotels — try one of those.';

    if (text.includes("remove") || text.includes("delete")) {
      const stopwords = new Set(["remove", "delete", "the", "a", "an", "from", "day", "on", "please", "trip", "itinerary"]);
      const words = text
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 0 && !stopwords.has(w) && !/^\d+$/.test(w));
      let bestMatch: (typeof req.items)[number] | undefined;
      let bestScore = 0;
      for (const item of req.items) {
        const itemWords = item.title.toLowerCase().split(/\s+/);
        const score = words.filter((w) => itemWords.some((iw) => iw.includes(w) || w.includes(iw))).length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }
      if (!bestMatch) {
        yield { type: "result", result: clarify(`I couldn't find an item matching "${words.join(" ")}" in this trip — try naming it exactly as it appears in the itinerary.`) };
        return;
      }
      yield {
        type: "result",
        result: {
          status: "interpreted",
          reply: `Removed "${bestMatch.title}" from day ${bestMatch.dayNumber}.`,
          edit: { type: "removeItem", itemId: bestMatch.id },
          suggestions: [],
          usage,
        },
      };
      return;
    }

    const isHotelRequest = text.includes("hotel") || text.includes("stay") || (text.includes("swap") && !text.includes("activity"));
    if (isHotelRequest) {
      yield { type: "progress", step: "searchingOptions" };
      const currentStayTitle = req.items.find((it) => it.kind === "stay")?.title;
      const offers = await req.tools.searchHotelRates({ destination: req.destination, checkIn: req.checkIn, checkOut: req.checkOut, guests });
      const ranked = [...offers]
        .filter((o) => o.content.title !== currentStayTitle)
        .sort((a, b) => a.netRate.amountMinor - b.netRate.amountMinor || a.offerId.localeCompare(b.offerId));
      const suggestions: HotelSuggestion[] = ranked
        .slice(0, 3)
        .map((o) => ({ offerId: o.offerId, title: o.content.title, priceMinor: o.netRate.amountMinor, currency: o.netRate.currency }));
      if (suggestions.length === 0) {
        yield { type: "result", result: clarify("I couldn't find any other hotel options for this trip right now.") };
        return;
      }
      yield {
        type: "result",
        result: { status: "interpreted", reply: 'Here are a few hotel options — click "Add to trip" on the one you\'d like.', edit: null, suggestions, usage },
      };
      return;
    }

    if (text.includes("add")) {
      const dayCount = req.items.reduce((max, it) => Math.max(max, it.dayNumber), 1);
      const dayMatch = text.match(/day\s*(\d+)/);
      const requestedDay = dayMatch?.[1] ? Number.parseInt(dayMatch[1], 10) : undefined;
      if (requestedDay !== undefined && (requestedDay < 1 || requestedDay > dayCount)) {
        yield { type: "result", result: clarify(`This trip only has ${dayCount} day(s) — I can't add anything to day ${requestedDay}.`) };
        return;
      }
      const dayNumber = requestedDay ?? 1;

      yield { type: "progress", step: "searchingOptions" };
      const isTransfer = text.includes("transfer") || text.includes("transport") || text.includes("taxi") || text.includes("car");
      if (isTransfer) {
        const airport = `${req.destination} Airport`;
        const offers = await req.tools.quoteTransfer({ from: airport, to: req.destination, at: `${req.checkIn}T10:00:00Z`, passengers: guests });
        const ranked = [...offers].sort((a, b) => a.netRate.amountMinor - b.netRate.amountMinor || a.offerId.localeCompare(b.offerId));
        const pick = ranked[0];
        if (!pick) {
          yield { type: "result", result: clarify("I couldn't find any transfer options for this trip right now.") };
          return;
        }
        yield {
          type: "result",
          result: { status: "interpreted", reply: `Added "${pick.content.title}" to day ${dayNumber}.`, edit: { type: "addItem", dayNumber, port: "transfer", offerId: pick.offerId }, suggestions: [], usage },
        };
        return;
      }

      const offers = await req.tools.searchActivities({ destination: req.destination, participants: guests });
      const existingTitles = new Set(req.items.filter((it) => it.kind === "activity").map((it) => it.title));
      const ranked = [...offers].sort((a, b) => a.netRate.amountMinor - b.netRate.amountMinor || a.offerId.localeCompare(b.offerId));
      const pick = ranked.find((o) => !existingTitles.has(o.content.title)) ?? ranked[0];
      if (!pick) {
        yield { type: "result", result: clarify("I couldn't find any activities to add for this trip right now.") };
        return;
      }
      yield {
        type: "result",
        result: { status: "interpreted", reply: `Added "${pick.content.title}" to day ${dayNumber}.`, edit: { type: "addItem", dayNumber, port: "activity", offerId: pick.offerId }, suggestions: [], usage },
      };
      return;
    }

    yield { type: "result", result: clarify(CLARIFY_REPLY) };
  }

  /** Deterministic regex/keyword chat-first interpreter (spec 028,
   * research.md D7) — zero `Math.random()`, zero wall-clock read (dates are
   * resolved one layer up, in packages/api, never here — research.md D3).
   * Resolves only when BOTH a destination and a budget amount are found;
   * everything else defaults (research.md D4). */
  async interpretTripRequest(req: InterpretTripRequestRequest): Promise<InterpretTripRequestResult> {
    const usage = { inputTokens: 0, outputTokens: 0 };
    const text = req.message.toLowerCase();

    const destination = extractDestination(req.message);
    if (!destination) {
      return { status: "needsInfo", reply: "Which destination would you like to plan for?", usage };
    }
    const budget = extractBudget(text);
    if (!budget) {
      return { status: "needsInfo", reply: `What's your budget for the trip to ${destination}?`, usage };
    }

    const params: InterpretedTripParams = {
      destination,
      nights: extractNights(text) ?? 4,
      adults: extractAdults(text) ?? 2,
      children: 0,
      tripStyle: extractTripStyle(text),
      budgetMajor: budget.amount,
      currency: budget.currency,
    };
    return { status: "resolved", params, usage };
  }
}
