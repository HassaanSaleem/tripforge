// Workspace planner (spec 008 US1/US2, contract §2.1; streamed spec 016 —
// INV-028) — client component driving the agent-gated workspace.itinerary.draft
// SSE subscription through the typed browser tRPC client (research D1/D5).
// Renders the canonical document and budget fit exactly as returned — no
// client-side money arithmetic beyond display formatting (FR-009); every
// user-visible failure string comes from the pure mapping helpers (contract
// §2.3). Progress labels are purely informational (FR-008) — they never carry
// server data, only a fixed per-step string. The server component page gates
// who sees this form (INV-024); authorization stays in agentProcedure (INV-023).
// Presentation rides the seed-0009s theme kit (.tf-*) — premium bar, no bare HTML.
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { trpc, type DraftEvent, type DraftOutput } from "../../../lib/trpc/client.js";
import { BookingFlow } from "./booking-flow.js";
import { ItineraryDays } from "./itinerary-days.js";
import { ShareControl } from "./share-control.js";
import {
  draftErrorMessage,
  draftFailureMessage,
  formatMinorAmount,
  toTripRequest,
  type PlannerFormValues,
} from "../../../lib/planner-form.js";

type DraftedOutcome = Extract<DraftOutput, { status: "drafted" }>;
type DraftStep = Extract<DraftEvent, { type: "progress" }>["step"];

// Fixed, server-data-free labels (FR-008) — one per LLMPort DraftStep.
const STEP_LABEL: Record<DraftStep, string> = {
  searchingHotels: "Searching hotels…",
  searchingActivities: "Searching activities…",
  quotingTransfer: "Pricing transfers…",
  quotingCarRental: "Checking car-rental context…",
  assembling: "Assembling your itinerary…",
};

type PlannerViewState =
  | { phase: "idle" }
  | { phase: "drafting"; step?: DraftStep }
  | { phase: "drafted"; outcome: DraftedOutcome }
  | { phase: "failed"; message: string };

const INITIAL_VALUES: PlannerFormValues = {
  destination: "",
  checkIn: "",
  checkOut: "",
  adults: "2",
  children: "0",
  tripStyle: "",
  budgetMajor: "",
  budgetMode: "hardCap",
  currency: "EUR",
};

export function Planner({ onDrafted }: { onDrafted?: () => void } = {}) {
  const [values, setValues] = useState<PlannerFormValues>(INITIAL_VALUES);
  const [view, setView] = useState<PlannerViewState>({ phase: "idle" });
  const drafting = view.phase === "drafting";

  // Guards a late-arriving SSE event after the component unmounts or a fresh
  // submit supersedes the in-flight one — never a React state-after-unmount
  // warning (spec 016 edge case).
  const activeSubscription = useRef<{ unsubscribe: () => void } | null>(null);
  useEffect(() => {
    return () => {
      activeSubscription.current?.unsubscribe();
      activeSubscription.current = null;
    };
  }, []);

  function update<K extends keyof PlannerFormValues>(field: K, value: PlannerFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (drafting) return;
    const mapped = toTripRequest(values);
    if ("error" in mapped) {
      setView({ phase: "failed", message: mapped.error });
      return;
    }
    activeSubscription.current?.unsubscribe();
    setView({ phase: "drafting" });
    activeSubscription.current = trpc.workspace.itinerary.draft.subscribe(mapped.request, {
      onData(draftEvent: DraftEvent) {
        if (draftEvent.type === "progress") {
          setView((current) => (current.phase === "drafting" ? { phase: "drafting", step: draftEvent.step } : current));
          return;
        }
        const outcome = draftEvent.outcome;
        if (outcome.status === "drafted") {
          setView({ phase: "drafted", outcome });
          // The workspace trips panel refreshes off this signal (spec 012 D2) —
          // fired only for a persisted draft, so the list never learns of
          // refusals or failures it cannot show.
          onDrafted?.();
        } else {
          setView({ phase: "failed", message: draftFailureMessage(outcome) });
        }
      },
      onError(error) {
        setView({ phase: "failed", message: draftErrorMessage(error) });
      },
      onComplete() {
        activeSubscription.current = null;
        // A stream that ends without ever delivering a terminal result event
        // is a failure, not a stuck spinner (spec 016 FR-007).
        setView((current) =>
          current.phase === "drafting"
            ? { phase: "failed", message: "The connection ended before drafting finished. Please try again." }
            : current,
        );
      },
    });
  }

  return (
    <section className="tf-card">
      <p className="tf-eyebrow">AI itinerary planner</p>
      <h2>Plan a trip</h2>
      <form onSubmit={handleSubmit} className="tf-planner-form">
        <label htmlFor="destination" className="span-2">
          Destination
          <input
            id="destination"
            name="destination"
            type="text"
            required
            placeholder="e.g. Lisbon"
            value={values.destination}
            onChange={(e) => update("destination", e.target.value)}
          />
        </label>
        <label htmlFor="checkIn">
          Check-in
          <input
            id="checkIn"
            name="checkIn"
            type="date"
            required
            value={values.checkIn}
            onChange={(e) => update("checkIn", e.target.value)}
          />
        </label>
        <label htmlFor="checkOut">
          Check-out
          <input
            id="checkOut"
            name="checkOut"
            type="date"
            required
            value={values.checkOut}
            onChange={(e) => update("checkOut", e.target.value)}
          />
        </label>
        <label htmlFor="adults">
          Adults
          <input
            id="adults"
            name="adults"
            type="number"
            min={1}
            step={1}
            required
            value={values.adults}
            onChange={(e) => update("adults", e.target.value)}
          />
        </label>
        <label htmlFor="children">
          Children
          <input
            id="children"
            name="children"
            type="number"
            min={0}
            step={1}
            value={values.children}
            onChange={(e) => update("children", e.target.value)}
          />
        </label>
        <label htmlFor="tripStyle">
          Trip style
          <select
            id="tripStyle"
            name="tripStyle"
            value={values.tripStyle}
            onChange={(e) => update("tripStyle", e.target.value as PlannerFormValues["tripStyle"])}
          >
            <option value="">(default)</option>
            <option value="balanced">balanced</option>
            <option value="budget">budget</option>
            <option value="premium">premium</option>
          </select>
        </label>
        <label htmlFor="budgetMajor">
          Budget
          <input
            id="budgetMajor"
            name="budgetMajor"
            type="number"
            min={0}
            step="0.01"
            required
            placeholder="e.g. 2500"
            value={values.budgetMajor}
            onChange={(e) => update("budgetMajor", e.target.value)}
          />
        </label>
        <label htmlFor="budgetMode">
          Budget mode
          <select
            id="budgetMode"
            name="budgetMode"
            value={values.budgetMode}
            onChange={(e) => update("budgetMode", e.target.value as PlannerFormValues["budgetMode"])}
          >
            <option value="hardCap">hardCap</option>
            <option value="target">target</option>
          </select>
        </label>
        <label htmlFor="currency">
          Currency
          <input
            id="currency"
            name="currency"
            type="text"
            required
            maxLength={3}
            value={values.currency}
            onChange={(e) => update("currency", e.target.value)}
          />
        </label>
        <button type="submit" className="tf-btn--cta" disabled={drafting}>
          {drafting ? "Drafting…" : "Draft itinerary"}
        </button>
      </form>

      {view.phase === "drafting" ? (
        <p className="tf-drafting" aria-live="polite">
          <span className="tf-spin" aria-hidden="true" />
          {view.step ? STEP_LABEL[view.step] : "Designing your trip — pricing real inventory…"}
        </p>
      ) : null}
      {view.phase === "failed" ? <p role="alert">{view.message}</p> : null}
      {view.phase === "drafted" ? (
        <>
          <DraftResult outcome={view.outcome} />
          {/* Booking controls exist only inside a verified agent's drafted plan
              (spec 009 FR-009, research D2); keyed so a new draft resets the flow. */}
          {/* A just-drafted itinerary has no booking history yet — always the
              form's default markup (seed-0028 only prefills on REOPEN). */}
          <BookingFlow key={view.outcome.itinerary.id} itinerary={view.outcome.itinerary} latestBookedMarkupBps={null} />
          {/* Client-view share (spec 010 US2) — same composition rule, keyed the
              same way so a new draft resets the shared-link state. */}
          <ShareControl key={`share-${view.outcome.itinerary.id}`} itineraryId={view.outcome.itinerary.id} />
        </>
      ) : null}
    </section>
  );
}

function DraftResult({ outcome }: { outcome: DraftedOutcome }) {
  const { itinerary, fit } = outcome;
  return (
    <section data-testid="draft-result" className="tf-draft" style={{ marginTop: "1.5rem" }}>
      <header className="tf-draft-head">
        <h2>{itinerary.title}</h2>
        <p>
          Total{" "}
          <strong className="tf-price">
            {formatMinorAmount(itinerary.pricing.total.amountMinor, itinerary.currency)}
          </strong>{" "}
          · budget mode <strong>{itinerary.pricing.budgetMode}</strong>
        </p>
      </header>

      <ItineraryDays days={itinerary.days} />

      <h3>Budget summary</h3>
      <table data-testid="budget-fit" className="tf-fit-table">
        <thead>
          <tr>
            <th align="left">Category</th>
            <th align="right">Allocated</th>
            <th align="right">Planned</th>
            <th align="left">State</th>
          </tr>
        </thead>
        <tbody>
          {fit.categories.map((category) => (
            <tr key={category.category}>
              <td>{category.category}</td>
              <td align="right" className="tf-price">
                {formatMinorAmount(category.allocatedMinor, itinerary.currency)}
              </td>
              <td align="right" className="tf-price">
                {formatMinorAmount(category.spentMinor, itinerary.currency)}
              </td>
              <td>
                <span className={`tf-state tf-state--${category.state}`}>{category.state}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
