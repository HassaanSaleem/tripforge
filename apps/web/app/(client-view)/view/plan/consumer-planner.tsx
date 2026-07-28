// Consumer chat-first, budget-aware AI planner (spec 038 US1/US2). Brand-neutral
// consumer component (INV-024: the workspace ChatEntry/Planner never leak into
// the client experience) that REUSES the SERVER engine via the clientView
// planner procedures: planInterpret (chat → TripRequest), planDraft (redacted,
// sell-price-only compare — INV-020), requestPlan (the request-an-agent lead).
// Nothing here books or persists a trip; the terminal fork routes demand to the
// agent network (Constitution I). Presentation rides the seed-0009s .tf-* theme.
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  trpc,
  type ConsumerTripRequest,
  type ConsumerDraftOption,
  type PlanDraftEvent,
} from "../../../../lib/trpc/client.js";
import { formatMinorAmount } from "../../../../lib/planner-form.js";
import { transportErrorMessage } from "../../../../lib/transport-error.js";

interface ChatMessage {
  id: number;
  role: "traveler" | "assistant";
  text: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  flightsTransport: "Flights & transport",
  accommodation: "Stays",
  activities: "Activities",
  localTransport: "Local transport",
  buffer: "Buffer",
};

const KIND_LABEL: Record<string, string> = {
  stay: "Stay",
  activity: "Activity",
  transfer: "Transfer",
};

/** Whole-number nights between two ISO (YYYY-MM-DD, UTC) dates — deterministic
 * (no wall-clock read), so the keyless summary is stable. */
function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
}

function summarise(req: ConsumerTripRequest): string {
  const nights = nightsBetween(req.checkIn, req.checkOut);
  const travellers = req.party.adults + req.party.children;
  const budget = formatMinorAmount(req.budget.amountMinor, req.budget.currency);
  const cap = req.budget.mode === "hardCap" ? "up to" : "around";
  return `Here's what I've got: ${req.destination} · ${nights} night${nights === 1 ? "" : "s"} · ${travellers} traveller${travellers === 1 ? "" : "s"} · budget ${cap} ${budget}. Ready to build it?`;
}

type View =
  | { phase: "chat" }
  | { phase: "drafting" }
  | { phase: "comparing"; options: ConsumerDraftOption[]; tripRequest: ConsumerTripRequest }
  | { phase: "chosen"; option: ConsumerDraftOption; tripRequest: ConsumerTripRequest }
  | { phase: "failed"; message: string };

type Fork =
  | { choice: null }
  | { choice: "self_drive" }
  | { choice: "handoff"; state: "idle" | "submitting" | "submitted" | { error: string } };

function draftFailureMessage(outcome: Extract<PlanDraftEvent, { type: "result" }>["outcome"]): string {
  if (outcome.status === "drafted") return "";
  if (outcome.status === "infeasible") {
    return outcome.reason === "budget_below_reserve"
      ? "That budget is a little low for this trip — try increasing it or shortening the trip."
      : "Those dates don't leave any nights — check your dates and try again.";
  }
  return "We couldn't put a trip together from that — try adjusting the destination, dates or budget.";
}

export function ConsumerPlanner({
  contactName,
  contactEmail,
  initialDestination,
}: {
  contactName: string | null;
  contactEmail: string | null;
  // Optional seed from the Discover feed's "Plan this" handoff (spec 039,
  // contracts/discover-to-consumer-planner-handoff.md). Pre-fills the first chat
  // message so the traveler proceeds with one Send — it is ONLY composer text: it
  // never auto-submits, skips confirm, or bypasses any interpret/validation step
  // (FR-007). Absent/empty → the composer starts empty, byte-identical to today.
  initialDestination?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [travelerTurns, setTravelerTurns] = useState<string[]>([]);
  const [draftText, setDraftText] = useState(initialDestination ? `Plan a trip to ${initialDestination}` : "");
  const [thinking, setThinking] = useState(false);
  const [resolved, setResolved] = useState<ConsumerTripRequest | null>(null);
  const [view, setView] = useState<View>({ phase: "chat" });
  const [fork, setFork] = useState<Fork>({ choice: null });
  const nextId = useRef(0);
  const activeSub = useRef<{ unsubscribe: () => void } | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const busy = view.phase === "drafting";

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, thinking, busy]);

  function appendMessage(entry: Omit<ChatMessage, "id">) {
    nextId.current += 1;
    setMessages((current) => [...current, { ...entry, id: nextId.current }]);
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draftText.trim();
    if (!text || thinking) return;
    const priorMessages = travelerTurns;
    appendMessage({ role: "traveler", text });
    setTravelerTurns((current) => [...current, text]);
    setDraftText("");
    setResolved(null);
    setThinking(true);
    try {
      const result = await trpc.clientView.planInterpret.mutate({
        message: text,
        ...(priorMessages.length > 0 ? { priorMessages } : {}),
      });
      if (result.status === "resolved") {
        setResolved(result.tripRequest);
        appendMessage({ role: "assistant", text: summarise(result.tripRequest) });
      } else if (result.status === "needsInfo") {
        appendMessage({ role: "assistant", text: result.reply });
      } else {
        appendMessage({ role: "assistant", text: "I couldn't work out a trip from that — try rephrasing." });
      }
    } catch {
      appendMessage({ role: "assistant", text: "The connection was interrupted — try again." });
    } finally {
      setThinking(false);
    }
  }

  function build(tripRequest: ConsumerTripRequest) {
    activeSub.current?.unsubscribe();
    setView({ phase: "drafting" });
    setFork({ choice: null });
    activeSub.current = trpc.clientView.planDraft.subscribe(tripRequest, {
      onData(event: PlanDraftEvent) {
        if (event.type === "progress") return;
        const outcome = event.outcome;
        if (outcome.status === "drafted") {
          setView({ phase: "comparing", options: outcome.options, tripRequest });
        } else {
          setView({ phase: "failed", message: draftFailureMessage(outcome) });
        }
      },
      onError(error) {
        setView({ phase: "failed", message: transportErrorMessage(error, { forbidden: "This planner isn't available right now.", badRequest: "We couldn't build that trip — please try again." }) });
      },
      onComplete() {
        activeSub.current = null;
        setView((current) =>
          current.phase === "drafting"
            ? { phase: "failed", message: "The connection ended before your options were ready. Please try again." }
            : current,
        );
      },
    });
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>, option: ConsumerDraftOption, tripRequest: ConsumerTripRequest) {
    event.preventDefault();
    if (fork.choice !== "handoff" || fork.state === "submitting") return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("contactName") ?? "").trim();
    if (name === "") {
      setFork({ choice: "handoff", state: { error: "Enter your name so an agent can reach you." } });
      return;
    }
    const email = String(form.get("contactEmail") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    setFork({ choice: "handoff", state: "submitting" });
    try {
      const outcome = await trpc.clientView.requestPlan.mutate({
        tripRequest,
        variant: option.variant,
        optionTitle: option.view.title,
        contactName: name,
        ...(email === "" ? {} : { contactEmail: email }),
        ...(notes === "" ? {} : { notes }),
      });
      if (outcome.status === "submitted") {
        setFork({ choice: "handoff", state: "submitted" });
      } else {
        setFork({ choice: "handoff", state: { error: "Something went wrong — please try again." } });
      }
    } catch (error) {
      setFork({
        choice: "handoff",
        state: { error: transportErrorMessage(error, { forbidden: "You need to be signed in to send this request.", badRequest: "Enter your name so an agent can reach you." }) },
      });
    }
  }

  // ─── Compare / chosen / failed views ─────────────────────────────────────

  if (view.phase === "failed") {
    return (
      <section className="tf-card" data-testid="consumer-planner-failed">
        <p className="tf-eyebrow">Plan a trip</p>
        <h2>We hit a snag</h2>
        <p role="alert">{view.message}</p>
        <button type="button" className="tf-btn tf-btn--cta" onClick={() => { setView({ phase: "chat" }); setResolved(null); }} data-testid="consumer-planner-retry">
          Start over
        </button>
      </section>
    );
  }

  if (view.phase === "comparing") {
    return (
      <section className="tf-card" data-testid="consumer-planner-compare">
        <p className="tf-eyebrow">Your options</p>
        <h2>Compare live-priced trips</h2>
        <p className="tf-planner-lede">Every price is live from real inventory. Pick the one you like to move forward.</p>
        <ul className="tf-compare-options" data-testid="consumer-compare-options">
          {view.options.map((option) => (
            <li key={option.variant} className="tf-card tf-compare-option" data-testid="consumer-compare-option" data-variant={option.variant}>
              <header className="tf-compare-option-head">
                <b>{option.view.title}</b>
                <span className="tf-price" data-testid="consumer-option-total">
                  {option.view.totalSellMinor !== null
                    ? formatMinorAmount(option.view.totalSellMinor, option.view.currency)
                    : "Priced on request"}
                </span>
              </header>
              <p className="tf-item-kind">{option.label}</p>
              <dl className="tf-compare-breakdown" data-testid="consumer-option-breakdown">
                {option.fit.categories.map((cat) => (
                  <div key={cat.category}>
                    <dt>{CATEGORY_LABEL[cat.category] ?? cat.category}</dt>
                    <dd>{formatMinorAmount(cat.spentMinor, option.view.currency)} <span className="tf-field-hint">of {formatMinorAmount(cat.allocatedMinor, option.view.currency)}</span></dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                className="tf-btn tf-btn--cta"
                data-testid="consumer-choose-option"
                onClick={() => { setView({ phase: "chosen", option, tripRequest: view.tripRequest }); setFork({ choice: null }); }}
              >
                Choose this trip
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="tf-link-btn" onClick={() => setView({ phase: "chat" })} data-testid="consumer-compare-back">
          Start a new plan
        </button>
      </section>
    );
  }

  if (view.phase === "chosen") {
    const { option, tripRequest } = view;
    return (
      <>
        <section className="tf-card" data-testid="consumer-plan-detail">
          <p className="tf-eyebrow">Your plan</p>
          <h2>{option.view.title}</h2>
          {option.view.totalSellMinor !== null ? (
            <p className="tf-price" data-testid="consumer-plan-total">
              {formatMinorAmount(option.view.totalSellMinor, option.view.currency)} total
            </p>
          ) : null}
          {option.view.days.map((day) => (
            <div key={day.dayNumber} className="tf-plan-day">
              <h3>Day {day.dayNumber}</h3>
              <ul className="tf-items">
                {day.items.map((item, idx) => (
                  <li key={`${day.dayNumber}-${idx}`}>
                    <span className="tf-item-kind">{KIND_LABEL[item.kind] ?? item.kind}</span>: {item.title}
                    {item.sellMinor !== null ? (
                      <span className="tf-price">{formatMinorAmount(item.sellMinor, option.view.currency)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button type="button" className="tf-link-btn" onClick={() => setView({ phase: "comparing", options: [option], tripRequest })} data-testid="consumer-plan-back">
            Back to options
          </button>
        </section>

        <section className="tf-card tf-client-fork" data-testid="consumer-fork">
          <p className="tf-eyebrow">What next?</p>
          <h2>Make it real</h2>
          {fork.choice === null ? (
            <div className="tf-client-fork-choices">
              <button type="button" className="tf-btn" data-testid="consumer-fork-self-drive" onClick={() => setFork({ choice: "self_drive" })}>
                Book it myself
              </button>
              <button type="button" className="tf-btn tf-btn--cta" data-testid="consumer-fork-handoff" onClick={() => setFork({ choice: "handoff", state: "idle" })}>
                Have an agent arrange &amp; book this for me
              </button>
            </div>
          ) : null}

          {fork.choice === "self_drive" ? (
            <div data-testid="consumer-self-drive-note">
              <h3>Book it myself</h3>
              <p>
                Self-drive booking through the platform runs on trips an agent has prepared for
                you. To book this self-planned trip, ask an agent to arrange it — they&apos;ll set
                it up and share it back so you can book each part yourself.
              </p>
              <button type="button" className="tf-btn tf-btn--cta" data-testid="consumer-self-drive-to-handoff" onClick={() => setFork({ choice: "handoff", state: "idle" })}>
                Have an agent arrange &amp; book this for me
              </button>
            </div>
          ) : null}

          {fork.choice === "handoff" && fork.state === "submitted" ? (
            <div data-testid="consumer-handoff-submitted">
              <h3>Request sent</h3>
              <p>An agent will be in touch to arrange and book <b>{option.view.title}</b>. You can keep planning other trips in the meantime.</p>
            </div>
          ) : null}

          {fork.choice === "handoff" && fork.state !== "submitted" ? (
            <form onSubmit={(e) => submitRequest(e, option, tripRequest)} className="tf-client-request-form" data-testid="consumer-handoff-form">
              <h3>Have an agent arrange &amp; book this</h3>
              <p>Leave your details and an agent will take <b>{option.view.title}</b> from here.</p>
              <label>
                Your name
                <input name="contactName" type="text" defaultValue={contactName ?? ""} data-testid="consumer-handoff-name" required />
              </label>
              <label>
                Email (optional)
                <input name="contactEmail" type="email" defaultValue={contactEmail ?? ""} data-testid="consumer-handoff-email" />
              </label>
              <label>
                Anything else? (optional)
                <textarea name="notes" data-testid="consumer-handoff-notes" rows={3} />
              </label>
              {typeof fork.state === "object" ? (
                <p role="alert" className="tf-field-hint" data-testid="consumer-handoff-error">{fork.state.error}</p>
              ) : null}
              <button type="submit" className="tf-btn tf-btn--cta" data-testid="consumer-handoff-submit" disabled={fork.state === "submitting"}>
                {fork.state === "submitting" ? "Sending…" : "Send request"}
              </button>
            </form>
          ) : null}
        </section>
      </>
    );
  }

  // ─── Chat / drafting view ────────────────────────────────────────────────

  return (
    <section className="tf-card tf-chat" data-testid="consumer-planner-chat">
      <p className="tf-eyebrow">Build by chatting</p>
      <h3>Describe the trip you want</h3>
      <div className="tf-chat-messages" data-testid="consumer-chat-messages" aria-live="polite" ref={messagesRef}>
        {messages.length === 0 ? (
          <p className="tf-chat-empty">
            Try &quot;Plan a trip to Lisbon&quot; — I&apos;ll ask for anything I still need. Add the
            budget, dates, party or style whenever you like.
          </p>
        ) : null}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`tf-chat-message tf-chat-message--${message.role === "traveler" ? "agent" : "assistant"}`}
            data-testid="consumer-chat-message"
            data-role={message.role}
          >
            <p>{message.text}</p>
          </div>
        ))}
        {thinking ? (
          <p className="tf-chat-thinking" aria-live="polite" data-testid="consumer-chat-thinking">
            <span className="tf-spin" aria-hidden="true" />
            Thinking…
          </p>
        ) : null}
        {busy ? (
          <p className="tf-chat-thinking" aria-live="polite" data-testid="consumer-planner-drafting">
            <span className="tf-spin" aria-hidden="true" />
            Building your live-priced options…
          </p>
        ) : null}
      </div>
      {resolved && !thinking && !busy ? (
        <div className="tf-chat-confirm" data-testid="consumer-chat-confirm">
          <button type="button" className="tf-btn--cta" data-testid="consumer-build-cta" onClick={() => build(resolved)}>
            Build my trip
          </button>
          <span className="tf-field-hint">or keep chatting to adjust it</span>
        </div>
      ) : null}
      <form onSubmit={handleChatSubmit} className="tf-chat-form">
        <input
          type="text"
          data-testid="consumer-chat-input"
          placeholder='e.g. "around EUR 2000 for 4 nights, 2 people"'
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          disabled={thinking || busy}
        />
        <button type="submit" className="tf-btn--cta" disabled={thinking || busy || draftText.trim().length === 0}>
          Send
        </button>
      </form>
    </section>
  );
}
