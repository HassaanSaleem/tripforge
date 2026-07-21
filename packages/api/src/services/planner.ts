// Draft orchestration (spec 005 US1; contracts §1; spec 019 multi-option):
// allocate (pure) → planner via LLMPort (bounded, injected tool executors —
// research D7) → re-verify every proposal against the supply ports (FR-003:
// verification defines truth; unverified offers are dropped) → assemble EACH
// labeled variant to fit (pure). Comparison (`draftOptions`) stops there —
// nothing is persisted. Selection (`selectDraftOption`) re-runs the SAME
// pipeline for the chosen variant and persists the canonical document +
// trip_created PMF event in ONE transaction (INV-021). Business failures are
// values; nothing is persisted on any failure path, and nothing is persisted
// for a variant the agent didn't pick (spec 019 FR-006).
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
import { itinerary as itineraryTable, recordPmfEvent, type Db } from "@tripforge/db";
import {
  DRAFT_VARIANT_LABELS,
  type DraftItineraryResult,
  type DraftStep,
  type DraftVariant,
  type PlannerToolDeps,
} from "@tripforge/llm";
import { z } from "zod";
import type { AgentSessionContext, Container } from "../context.js";

/** Destination + date-range + party — shared by the AI-drafted `tripRequestSchema`
 * below and the manually-built `createManualItineraryInputSchema` (spec 029,
 * packages/api/src/services/itineraries.ts): both describe the same trip basics,
 * one via the planner, one via the hand-built form. */
export const tripBasicsShape = {
  destination: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date (YYYY-MM-DD)"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date (YYYY-MM-DD)"),
  party: z.strictObject({
    adults: z.number().int().min(1),
    children: z.number().int().min(0).default(0),
  }),
};

/** Shared `.refine` predicate for any schema built from `tripBasicsShape`. */
export function checkOutAfterCheckIn(v: { checkIn: string; checkOut: string }): boolean {
  return v.checkOut > v.checkIn;
}

export const tripRequestSchema = z
  .strictObject({
    ...tripBasicsShape,
    tripStyle: z.enum(["balanced", "budget", "premium"]).optional(),
    budget: z.strictObject({
      mode: z.enum(["hardCap", "target"]),
      amountMinor: z.number().int().positive(),
      currency: z.string().length(3).toUpperCase(),
    }),
    flightsReserveMinor: z.number().int().min(0).optional(),
  })
  .refine(checkOutAfterCheckIn, { message: "checkOut must be after checkIn" });

export type TripRequest = z.infer<typeof tripRequestSchema>;

// Selection input (spec 019 contracts/select-draft-subscription.md): the
// client echoes back the ORIGINAL trip request plus which variant it picked
// — never itinerary content or pricing (FR-012).
export const selectDraftInputSchema = z.strictObject({
  tripRequest: tripRequestSchema,
  variant: z.enum(["budgetSavvy", "balanced", "premium"]),
});
export type SelectDraftInput = z.infer<typeof selectDraftInputSchema>;

// Exported (spec 016): the draft procedure is now a subscription, so this
// union is inference-load-bearing for the router's AsyncGenerator return type
// (see routers/itinerary.ts) — no longer a premature export. Unchanged shape
// from before spec 019: this is what `selectDraft` yields on success, so the
// existing DraftResult/BookingFlow/ShareControl UI needs zero changes.
export type DraftOutcome =
  | { status: "drafted"; itinerary: Itinerary; fit: AssembleResult["fit"] }
  | { status: "infeasible"; reason: "budget_below_reserve" | "no_days" }
  | { status: "planner_failed"; reason: "malformed_output" | "no_proposals" };

/** Streamed draft progress (INV-028, spec 016) — forwarded from LLMPort's
 * DraftProgressEvent, terminated by exactly one result event carrying the
 * existing DraftOutcome (unchanged shape/meaning). */
export type DraftEvent = { type: "progress"; step: DraftStep } | { type: "result"; outcome: DraftOutcome };

// ─── Multi-option comparison (spec 019) ────────────────────────────────────

/** A candidate itinerary shown during comparison — a fully assembled, live-
 * priced canonical Itinerary that is NOT persisted (data-model.md "DraftOption"). */
export interface DraftOption {
  variant: DraftVariant;
  label: string;
  itinerary: Itinerary;
  fit: AssembleResult["fit"];
}

export type CompareOutcome =
  | { status: "drafted"; options: DraftOption[] }
  | { status: "infeasible"; reason: "budget_below_reserve" | "no_days" }
  | { status: "planner_failed"; reason: "malformed_output" | "no_proposals" };

export type CompareEvent = { type: "progress"; step: DraftStep } | { type: "result"; outcome: CompareOutcome };

function tripDayCount(checkIn: string, checkOut: string): number {
  return Math.max(1, Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000));
}

/**
 * Canonical supply-search criteria, derived ONCE from the trip request — the
 * single vocabulary shared by the planner's tool executors, the assembly-time
 * verification sweep, and (via the persisted trip request) the quote flow's
 * INV-028 hold re-establishment. Supply offer identity is keyed off these
 * criteria, so any lexical drift between the sweeps silently drops genuinely
 * tool-returned proposals as unknown offers (spec 008 live fix, FR-011).
 */
function canonicalCriteria(req: Pick<TripRequest, "destination" | "checkIn" | "checkOut" | "party">) {
  const guests = req.party.adults + req.party.children;
  const airport = `${req.destination} Airport`;
  return {
    hotel: { destination: req.destination, checkIn: req.checkIn, checkOut: req.checkOut, guests },
    activity: { destination: req.destination, participants: guests },
    transfer: { from: airport, to: req.destination, at: `${req.checkIn}T10:00:00Z`, passengers: guests },
    carRental: {
      pickupLocation: airport,
      pickupAt: `${req.checkIn}T10:00:00Z`,
      dropoffAt: `${req.checkOut}T10:00:00Z`,
    },
  };
}

/**
 * Tool executors closing over the composition root's ports (research D7).
 * Trip-scoped criteria are PINNED to the canonical trip request (spec 008
 * live fix, FR-011): the model chooses WHICH returned offers to propose, but
 * cannot search a different trip than the agent described. Every offer the
 * model sees is therefore keyed exactly as the verification sweep re-reads
 * it, so model-authored criteria phrasing ("Paris, France" for a "Paris"
 * trip) can no longer drop tool-returned proposals at assembly.
 */
export function plannerToolDeps(container: Container, req: TripRequest): PlannerToolDeps {
  const criteria = canonicalCriteria(req);
  return {
    searchHotelRates: () => container.hotel.search(criteria.hotel),
    searchActivities: () => container.activity.search(criteria.activity),
    quoteTransfer: () => container.transfer.search(criteria.transfer),
    quoteCarRental: () => container.carRental.search(criteria.carRental),
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
  const criteria = canonicalCriteria(req);
  const [hotels, activities, transfers] = await Promise.all([
    container.hotel.search(criteria.hotel),
    container.activity.search(criteria.activity),
    container.transfer.search(criteria.transfer),
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

type PlannerCoreOutcome =
  | { status: "infeasible"; reason: "budget_below_reserve" | "no_days" }
  | { status: "planner_failed"; reason: "malformed_output" | "no_proposals" }
  | { status: "assembled"; options: DraftOption[] };

type PlannerCoreEvent = { type: "progress"; step: DraftStep } | { type: "core"; outcome: PlannerCoreOutcome };

/**
 * The pipeline shared by comparison and selection (spec 019 plan.md Project
 * Structure): budget allocation → LLMPort tool loop (1-3 labeled drafts) →
 * fresh supply verification → pure assembly of EVERY variant. Never touches
 * the database — persistence is the caller's decision (`selectDraftOption`
 * only), so calling this twice (once to compare, once to select) never
 * double-writes anything.
 */
async function* plannerCore(container: Container, session: AgentSessionContext, input: TripRequest): AsyncGenerator<PlannerCoreEvent> {
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
    yield { type: "core", outcome: { status: "infeasible", reason: allocation.reason } };
    return;
  }
  const allocatedMinor = (category: string): number =>
    allocation.allocations.find((a) => a.category === category)?.allocated.amountMinor ?? 0;

  let plannerResult: DraftItineraryResult | undefined;
  for await (const event of container.llm.draftItinerary({
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
    tools: plannerToolDeps(container, input),
  })) {
    if (event.type === "progress") {
      yield { type: "progress", step: event.step };
    } else {
      plannerResult = event.result;
    }
  }
  // A generator that ends without a terminal "result" event is treated the
  // same as an explicit no_proposals failure (defensive — LLMPort's contract
  // guarantees exactly one terminal event, per data-model.md).
  if (!plannerResult || plannerResult.status === "failed") {
    yield {
      type: "core",
      outcome: { status: "planner_failed", reason: plannerResult?.status === "failed" ? plannerResult.reason : "no_proposals" },
    };
    return;
  }
  const drafted = plannerResult;

  const offers = await verifiedSupplyCatalog(container, input);

  const options: DraftOption[] = [];
  for (const named of drafted.drafts) {
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
      title: named.draft.title,
      draftDays: named.draft.days.map<DraftDayProposal>((d) => ({ items: d.items })),
      offers,
      allocations: allocation.allocations,
      rates: container.rates,
    });
    // A draft whose every proposal was dropped is not a plan (INV-014) — drop
    // just this variant rather than fail the whole comparison, as long as at
    // least one other variant survives (checked below).
    const itemCount = assembled.itinerary.days.reduce((acc, d) => acc + d.items.length, 0);
    if (itemCount === 0) continue;
    options.push({ variant: named.variant, label: DRAFT_VARIANT_LABELS[named.variant], itinerary: assembled.itinerary, fit: assembled.fit });
  }

  if (options.length === 0) {
    yield { type: "core", outcome: { status: "planner_failed", reason: "no_proposals" } };
    return;
  }

  yield { type: "core", outcome: { status: "assembled", options } };
}

/**
 * Compare-time drafting (spec 019 US1/contracts/itinerary-draft-subscription.md):
 * runs the shared pipeline and returns every labeled option it produced.
 * ZERO persistence — no DB row, no trip_created PMF event, regardless of how
 * many options come back or whether the caller ever picks one.
 */
export async function* draftOptions(container: Container, session: AgentSessionContext, input: TripRequest): AsyncGenerator<CompareEvent> {
  if (!container.db) {
    throw new Error("database not configured");
  }
  for await (const event of plannerCore(container, session, input)) {
    if (event.type === "progress") {
      yield { type: "progress", step: event.step };
      continue;
    }
    if (event.outcome.status === "assembled") {
      yield { type: "result", outcome: { status: "drafted", options: event.outcome.options } };
    } else {
      yield { type: "result", outcome: event.outcome };
    }
  }
}

/**
 * Persist a newly created itinerary — ONE transaction: insert the document +
 * trip request, then record the `trip_created` PMF event. Shared by
 * `selectDraftOption` (AI-drafted) and `createManualItinerary` (spec 029,
 * packages/api/src/services/itineraries.ts) — both mean "not a licensed/
 * resold copy" to the PMF `source` field (research D2), so it stays the fixed
 * `"self_built"` regardless of `creationSource`.
 */
export async function persistNewItinerary(
  db: Db,
  session: AgentSessionContext,
  params: { document: Itinerary; tripRequest: TripRequest; creationSource: "manual" | "ai_drafted" },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(itineraryTable).values({
      id: params.document.id,
      agencyId: session.agencyId,
      title: params.document.title,
      currency: params.document.currency,
      document: params.document,
      tripRequest: params.tripRequest,
      creationSource: params.creationSource,
    });
    await recordPmfEvent(tx, {
      type: "trip_created",
      agencyId: session.agencyId,
      itineraryId: params.document.id,
      source: "self_built",
      actorUserId: session.userId,
    });
  });
}

/**
 * Selection (spec 019 US2/contracts/select-draft-subscription.md): re-runs the
 * SAME pipeline for `input.tripRequest` (fresh supply verification per FR-008
 * — inventory may have changed since comparison), then persists exactly the
 * requested variant — identical persistence semantics to the pre-spec-019
 * single-draft flow (one DB row + one trip_created PMF event, ONE transaction).
 * If the requested variant doesn't reappear in the fresh regeneration, this is
 * a typed planner_failed outcome — never a silent substitution of a different
 * variant than the agent picked.
 */
export async function* selectDraftOption(container: Container, session: AgentSessionContext, input: SelectDraftInput): AsyncGenerator<DraftEvent> {
  const db = container.db;
  if (!db) {
    throw new Error("database not configured");
  }
  for await (const event of plannerCore(container, session, input.tripRequest)) {
    if (event.type === "progress") {
      yield { type: "progress", step: event.step };
      continue;
    }
    if (event.outcome.status !== "assembled") {
      yield { type: "result", outcome: event.outcome };
      return;
    }
    const chosen = event.outcome.options.find((option) => option.variant === input.variant);
    if (!chosen) {
      yield { type: "result", outcome: { status: "planner_failed", reason: "no_proposals" } };
      return;
    }

    const document = stampProvenance(chosen.itinerary, session.agencyId);
    await persistNewItinerary(db, session, { document, tripRequest: input.tripRequest, creationSource: "ai_drafted" });

    yield { type: "result", outcome: { status: "drafted", itinerary: document, fit: chosen.fit } };
  }
}

// ─── Chat-first entry (spec 028) ───────────────────────────────────────────
// Interprets ONE chat message into the SAME TripRequest shape the structured
// form produces (research.md D1) — no schema change, no money-path change;
// the resulting TripRequest feeds the EXISTING draftOptions/selectDraftOption
// pipeline unchanged, via the client's own subsequent `draft` call.

export type InterpretChatOutcome =
  | { status: "resolved"; tripRequest: TripRequest }
  | { status: "needsInfo"; reply: string }
  | { status: "failed"; reason: "malformed_output" };

/** The LLM boundary only returns a duration (`nights`), never absolute dates
 * (research.md D3) — "now" is resolved here, one layer above the LLM
 * package. A fixed near-term horizon, not a clock port — `Container` has no
 * injected clock today, matching services/booking's own direct
 * Date.now()/new Date() use. */
const CHAT_ENTRY_CHECK_IN_OFFSET_DAYS = 21;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Mirrors apps/web/lib/planner-form.ts's `currencyFractionDigits` — kept as
 * a small, independently duplicated pure function rather than a new
 * cross-package export (research.md D8): packages/api cannot import from
 * apps/web, and extracting a shared package for one 3-line helper is not
 * justified by this feature's scope (constitution Simplicity Default). */
function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export async function interpretChatTripRequest(
  container: Container,
  _session: AgentSessionContext,
  input: { message: string; priorMessages?: string[] },
): Promise<InterpretChatOutcome> {
  // Multi-turn accumulation (spec 035 research.md D1): interpret the whole
  // conversation so far as ONE text, oldest turn first. FakeLLM already scans
  // the full message text (extractDestination/extractBudget/…), so joining the
  // transcript accumulates across turns deterministically with ZERO change to
  // packages/llm — and dates are still resolved below, one layer above the LLM
  // (spec 028 D3). Turns are COMMA-joined (not newline) with trailing sentence
  // punctuation trimmed, so the keyless extractor's clause-terminating regexes
  // read each turn's fields cleanly across the join (verified against the
  // deterministic FakeLLM). Absent/empty priorMessages with a punctuation-free
  // single message ⇒ identical to spec 028's single-shot behaviour.
  const conversation = [...(input.priorMessages ?? []), input.message]
    .map((turn) => turn.trim().replace(/[.,;!?]+$/u, ""))
    .filter((turn) => turn.length > 0)
    .join(", ");
  const result = await container.llm.interpretTripRequest({ purpose: "planner.chatEntry", message: conversation });
  if (result.status === "needsInfo") {
    return { status: "needsInfo", reply: result.reply };
  }
  if (result.status === "failed") {
    return { status: "failed", reason: result.reason };
  }

  const { params } = result;
  const checkIn = new Date(Date.now() + CHAT_ENTRY_CHECK_IN_OFFSET_DAYS * 86_400_000);
  const checkOut = new Date(checkIn.getTime() + params.nights * 86_400_000);
  const currency = params.currency.toUpperCase();
  const amountMinor = Math.round(params.budgetMajor * 10 ** currencyFractionDigits(currency));

  const parsed = tripRequestSchema.safeParse({
    destination: params.destination,
    checkIn: isoDate(checkIn),
    checkOut: isoDate(checkOut),
    party: { adults: params.adults, children: params.children },
    ...(params.tripStyle ? { tripStyle: params.tripStyle } : {}),
    budget: { mode: "hardCap", amountMinor, currency },
  });
  if (!parsed.success) {
    return { status: "failed", reason: "malformed_output" };
  }
  return { status: "resolved", tripRequest: parsed.data };
}
