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
  type LLMPort,
  type LlmCompleteRequest,
  type LlmCompleteResponse,
} from "./port.js";
import type { PlannerDraft, PlannerDraftItem } from "./planner-draft.js";

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

  async draftItinerary(req: DraftItineraryRequest): Promise<DraftItineraryResult> {
    this.draftCalls.push(req);
    const scripted = this.plannerScripts.shift();
    if (scripted) {
      return scripted;
    }

    const { request, tools } = req;
    const guests = request.party.adults + request.party.children;
    const airport = `${request.destination} Airport`;

    // The same lookups the real planner performs, deterministically.
    const [hotels, activities, transfers] = await Promise.all([
      tools.searchHotelRates({
        destination: request.destination,
        checkIn: request.checkIn,
        checkOut: request.checkOut,
        guests,
      }),
      tools.searchActivities({ destination: request.destination, participants: guests }),
      tools.quoteTransfer({
        from: airport,
        to: request.destination,
        at: `${request.checkIn}T10:00:00Z`,
        passengers: guests,
      }),
    ]);
    // Car rental is price CONTEXT only (D-006): looked up, never proposed.
    await tools.quoteCarRental({
      pickupLocation: airport,
      pickupAt: `${request.checkIn}T10:00:00Z`,
      dropoffAt: `${request.checkOut}T10:00:00Z`,
    });

    const cheapest = <T extends { netRate: { amountMinor: number }; offerId: string }>(offers: T[]): T[] =>
      [...offers].sort((a, b) => a.netRate.amountMinor - b.netRate.amountMinor || a.offerId.localeCompare(b.offerId));

    const dayCount = Math.max(
      1,
      Math.round((Date.parse(`${request.checkOut}T00:00:00Z`) - Date.parse(`${request.checkIn}T00:00:00Z`)) / 86_400_000),
    );
    const hotel = cheapest(hotels)[0];
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
    const transfer = cheapest(outboundTransfers)[0] ?? cheapest(transfers)[0];
    const returnTransfer = cheapest(returnTransfers)[0] ?? transfer;
    const rankedActivities = cheapest(activities);

    if (!hotel && rankedActivities.length === 0 && !transfer) {
      return { status: "failed", reason: "no_proposals" };
    }

    const days: PlannerDraft["days"] = [];
    for (let day = 1; day <= dayCount; day++) {
      const items: PlannerDraftItem[] = [];
      if (day === 1) {
        if (transfer) items.push({ port: "transfer", offerId: transfer.offerId });
        if (hotel) items.push({ port: "hotel", offerId: hotel.offerId });
      }
      const activity = rankedActivities[(day - 1) % Math.max(1, rankedActivities.length)];
      if (activity) items.push({ port: "activity", offerId: activity.offerId });
      if (day === dayCount && dayCount > 1 && transfer) {
        // transfer is narrowed truthy here; returnTransfer already falls
        // back to it when no distinct return offer exists.
        items.push({ port: "transfer", offerId: (returnTransfer ?? transfer).offerId });
      }
      days.push({ items });
    }

    return {
      status: "drafted",
      draft: {
        title: `${request.destination} ${request.tripStyle ?? "balanced"} trip`,
        days,
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
