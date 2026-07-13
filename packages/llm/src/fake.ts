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
  type DraftItineraryRequest,
  type DraftItineraryResult,
  type DraftProgressEvent,
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
}
