// Workspace planner (spec 008 US1/US2, contract §2.1; streamed spec 016 —
// INV-028; redesigned presentation-only by spec 018) — client component
// driving the agent-gated workspace.itinerary.draft SSE subscription through
// the typed browser tRPC client (research D1/D5). Renders the canonical
// document and budget fit exactly as returned — no client-side money
// arithmetic beyond display formatting (FR-009); every user-visible failure
// string comes from the pure mapping helpers (contract §2.3). Progress labels
// are purely informational (FR-008) — they never carry server data, only a
// fixed per-step string. The server component page gates who sees this form
// (INV-024); authorization stays in agentProcedure (INV-023).
// Presentation rides the seed-0009s theme kit (.tf-*) — premium bar, no bare
// HTML. Spec 018 redesign is presentation-only (no DraftInput/DraftOutput
// change): human-labeled segmented controls replace raw-enum <select>s, the
// destination field gains a seeded picker with free-text fallback, and the
// drafted result renders as an image-forward hero card instead of a plain
// table — see specs/018-planner-ux-redesign/ for the spec/plan/research.
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { trpc, type DraftEvent, type DraftOutput } from "../../../lib/trpc/client.js";
import { BookingFlow } from "./booking-flow.js";
import { ItineraryDays } from "./itinerary-days.js";
import { ShareControl } from "./share-control.js";
import {
  BUDGET_MODE_LABELS,
  draftErrorMessage,
  draftFailureMessage,
  formatMinorAmount,
  HERO_DESTINATIONS,
  resolveDestinationTreatment,
  toTripRequest,
  TRIP_STYLE_LABELS,
  type HeroDestination,
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

// Human labels only (spec 018 FR-001/002) — never the raw enum values themselves.
const BUDGET_MODE_OPTIONS = (Object.entries(BUDGET_MODE_LABELS) as [PlannerFormValues["budgetMode"], string][]).map(
  ([value, label]) => ({ value, label }),
);
const TRIP_STYLE_OPTIONS = (
  Object.entries(TRIP_STYLE_LABELS) as [Exclude<PlannerFormValues["tripStyle"], "">, string][]
).map(([value, label]) => ({ value, label }));

/** Accessible "choose exactly one" control (spec 018 research.md Decision 1) — replaces a raw `<select>` with human-labeled buttons, no new dependency. */
function SegmentedControl({
  ariaLabel,
  testId,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  testId: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="tf-segmented" role="radiogroup" aria-label={ariaLabel} data-testid={testId}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Planner() {
  const [values, setValues] = useState<PlannerFormValues>(INITIAL_VALUES);
  const [view, setView] = useState<PlannerViewState>({ phase: "idle" });
  const [destinationOpen, setDestinationOpen] = useState(false);
  const drafting = view.phase === "drafting";

  const destinationQuery = values.destination.trim().toLowerCase();
  const destinationMatches = HERO_DESTINATIONS.filter((hero) =>
    `${hero.city}, ${hero.country}`.toLowerCase().includes(destinationQuery),
  );

  function selectDestination(hero: HeroDestination) {
    update("destination", `${hero.city}, ${hero.country}`);
    setDestinationOpen(false);
  }

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
        <label htmlFor="destination" className="span-2 tf-destination-field">
          Destination
          <input
            id="destination"
            name="destination"
            type="text"
            required
            autoComplete="off"
            placeholder="Search a destination, or type your own"
            value={values.destination}
            aria-expanded={destinationOpen}
            onFocus={() => setDestinationOpen(true)}
            onChange={(e) => {
              update("destination", e.target.value);
              setDestinationOpen(true);
            }}
            onBlur={() => setDestinationOpen(false)}
          />
          {destinationOpen ? (
            <div className="tf-destination-picker" data-testid="destination-picker">
              {destinationMatches.length === 0 ? (
                <p className="tf-destination-empty">No seeded match — your typed destination will be used as-is.</p>
              ) : (
                destinationMatches.map((hero) => (
                  <button
                    key={hero.id}
                    type="button"
                    className="tf-destination-option"
                    data-testid="destination-option"
                    data-destination-id={hero.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectDestination(hero)}
                  >
                    <span className="tf-dest-card" style={{ background: hero.gradient }}>
                      <span className="tf-dest-flag" aria-hidden="true">
                        {hero.flag}
                      </span>
                    </span>
                    <span className="tf-destination-option-label">
                      <b>{hero.city}</b>
                      <span>{hero.country}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
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
        <div className="span-2">
          Trip style
          <SegmentedControl
            ariaLabel="Trip style"
            testId="trip-style-control"
            value={values.tripStyle}
            options={[{ value: "", label: "No preference" }, ...TRIP_STYLE_OPTIONS]}
            onChange={(value) => update("tripStyle", value as PlannerFormValues["tripStyle"])}
          />
        </div>
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
        <div>
          Budget mode
          <SegmentedControl
            ariaLabel="Budget mode"
            testId="budget-mode-control"
            value={values.budgetMode}
            options={BUDGET_MODE_OPTIONS}
            onChange={(value) => update("budgetMode", value as PlannerFormValues["budgetMode"])}
          />
        </div>
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
  const treatment = resolveDestinationTreatment(itinerary.title);
  return (
    <section data-testid="draft-result" className="tf-draft" style={{ marginTop: "1.5rem" }}>
      <header className="tf-draft-hero-header" data-testid="draft-hero-header" style={{ background: treatment.gradient }}>
        <span className="tf-draft-hero-flag" aria-hidden="true">
          {treatment.flag}
        </span>
        <p className="tf-eyebrow">{BUDGET_MODE_LABELS[itinerary.pricing.budgetMode]}</p>
        <h2>{itinerary.title}</h2>
        <p>
          Total{" "}
          <strong className="tf-price">
            {formatMinorAmount(itinerary.pricing.total.amountMinor, itinerary.currency)}
          </strong>
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
