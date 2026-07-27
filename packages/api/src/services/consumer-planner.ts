// clientView planner services (spec 038: consumer chat-first, budget-aware AI
// planner). REUSE — not fork — the agent engine: the chat interpreter and the
// compare-then-choose draft pipeline live in services/planner.ts; here we only
// (a) run the compare step for a traveler and REDACT it to the established
// sell-price-only trust boundary (toClientItineraryView), and (b) capture the
// request-an-agent fork as a durable, agency-less, NON-money lead.
//
// INV-024: these run behind clientView protectedProcedures — a traveler NEVER
// invokes a workspace procedure. INV-020: the traveler sees sell prices only.
// The compare itinerary is NEVER persisted (no booking / markup_ledger /
// trip_created / itinerary write) — a from-scratch consumer plan has no owning
// agency, and inventing one would be an operator ownership/revenue decision
// (ALWAYS-HALT). The transient itinerary's required agencyId is an ephemeral
// randomUUID consumed only in-memory and dropped by the redaction projection.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { consumerPlanRequest } from "@tripforge/db";
import type { AssembleResult } from "@tripforge/domain";
import type { DraftStep, DraftVariant } from "@tripforge/llm";
import type { Container, SessionContext } from "../context.js";
import { draftOptions, tripRequestSchema, type TripRequest } from "./planner.js";
import { toClientItineraryView, type ClientItineraryView } from "./client-view.js";

function requireDb(container: Container): NonNullable<Container["db"]> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  return db;
}

// ─── Compare (traveler-facing, redacted, never persisted) ────────────────────

/** One compared option, redacted to the traveler-facing boundary: the canonical
 * Itinerary is projected to sell-price-only (`view`) and the raw document —
 * including its ephemeral agencyId and every netRate — never crosses. */
export interface ConsumerDraftOption {
  variant: DraftVariant;
  label: string;
  view: ClientItineraryView;
  /** Single-figure per-category budget breakdown (allocated vs used + fit
   * state) — no net/markup split. Rebalance moves are internal, dropped. */
  fit: { categories: AssembleResult["fit"]["categories"] };
}

export type ConsumerCompareOutcome =
  | { status: "drafted"; options: ConsumerDraftOption[] }
  | { status: "infeasible"; reason: "budget_below_reserve" | "no_days" }
  | { status: "planner_failed"; reason: "malformed_output" | "no_proposals" };

export type ConsumerCompareEvent =
  | { type: "progress"; step: DraftStep }
  | { type: "result"; outcome: ConsumerCompareOutcome };

/**
 * Compare-time drafting for a traveler (spec 038 US1). Runs the SAME
 * `draftOptions` pipeline the agent builder uses, under an EPHEMERAL agencyId
 * (never persisted — draftOptions itself writes nothing), then redacts each
 * option through the existing `toClientItineraryView` projection so no netRate /
 * supplyRef / markup ever reaches the traveler (INV-020). Brand-neutral: the
 * agency name is blank (INV-020/INV-024), and nothing is booked so the
 * booked-price map is empty.
 */
export async function* draftConsumerOptions(container: Container, input: TripRequest): AsyncGenerator<ConsumerCompareEvent> {
  // Ephemeral tenant id for the transient, never-persisted preview — satisfies
  // the canonical schema's required agencyId and is dropped by the projection.
  const ephemeralAgencyId = randomUUID();
  for await (const event of draftOptions(container, ephemeralAgencyId, input)) {
    if (event.type === "progress") {
      yield { type: "progress", step: event.step };
      continue;
    }
    if (event.outcome.status !== "drafted") {
      yield { type: "result", outcome: event.outcome };
      continue;
    }
    const options: ConsumerDraftOption[] = event.outcome.options.map((option) => ({
      variant: option.variant,
      label: option.label,
      view: toClientItineraryView(option.itinerary, "", new Map()),
      fit: { categories: option.fit.categories },
    }));
    yield { type: "result", outcome: { status: "drafted", options } };
  }
}

// ─── Request an agent (durable, agency-less, NON-money lead) ──────────────────

export const submitConsumerPlanRequestInputSchema = z.strictObject({
  tripRequest: tripRequestSchema,
  variant: z.enum(["budgetSavvy", "balanced", "premium"]),
  optionTitle: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  contactEmail: z.email().optional(),
  notes: z.string().max(2000).optional(),
});
export type SubmitConsumerPlanRequestInput = z.infer<typeof submitConsumerPlanRequestInputSchema>;

export type SubmitConsumerPlanRequestOutcome = { status: "submitted"; requestId: string };

/**
 * Persist one consumer plan request — the request-an-agent fork (spec 038 US2).
 * Stores the AUTHORITATIVE trip criteria + the traveler's own budget + the
 * chosen variant/title label + contact; NO net rate / markup / take-rate /
 * revenue-share and NO client-echoed sell total (the agent re-quotes for real).
 * NOT a money path: moves no money, touches no booking/itinerary table.
 */
export async function submitConsumerPlanRequest(
  container: Container,
  session: SessionContext,
  input: SubmitConsumerPlanRequestInput,
): Promise<SubmitConsumerPlanRequestOutcome> {
  const db = requireDb(container);
  const { tripRequest } = input;

  const inserted = await db
    .insert(consumerPlanRequest)
    .values({
      travelerUserId: session.userId,
      destination: tripRequest.destination,
      checkIn: tripRequest.checkIn,
      checkOut: tripRequest.checkOut,
      adults: tripRequest.party.adults,
      children: tripRequest.party.children,
      budgetAmountMinor: tripRequest.budget.amountMinor,
      budgetCurrency: tripRequest.budget.currency,
      budgetMode: tripRequest.budget.mode,
      variant: input.variant,
      optionTitle: input.optionTitle,
      contactName: input.contactName,
      contactEmail: input.contactEmail ?? null,
      notes: input.notes ?? null,
      status: "new",
    })
    .returning({ id: consumerPlanRequest.id });

  const row = inserted[0];
  if (!row) throw new Error("consumer plan request insert returned no row");
  return { status: "submitted", requestId: row.id };
}
