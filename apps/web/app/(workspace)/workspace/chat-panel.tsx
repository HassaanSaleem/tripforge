// Chat panel (spec 020 US1/US2) — client component driving the agent-gated
// workspace.itinerary.chatEdit SSE subscription + applyChatEdit mutation
// through the typed browser tRPC client, following the SAME
// subscription-ref-guard pattern already used by the planner's draft/
// selectDraft subscriptions (activeSubscription.current, unsubscribe on
// unmount/resubmit). Composed only inside an already-drafted itinerary — a
// chat message never carries itinerary content or pricing back to the server
// (FR-012); every reply/edit/suggestion comes from the server's own response.
// The conversation itself is session-scoped React state only (spec
// Assumptions) — only the resulting itinerary edits persist. Presentation
// rides the existing seed-0009s theme kit (.tf-*).
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { trpc, type ApplyChatEditInput, type ChatEditEvent, type ChatEditOutput, type HotelSuggestion } from "../../../lib/trpc/client.js";
import { formatMinorAmount } from "../../../lib/planner-form.js";

type AppliedOutcome = Extract<ChatEditOutput, { status: "applied" }>;

interface ChatMessage {
  id: number;
  role: "agent" | "assistant";
  text: string;
  suggestions?: HotelSuggestion[];
}

type ChatPhase = "idle" | "thinking";

export function ChatPanel({
  itineraryId,
  currentStayDayNumber,
  onItineraryUpdated,
}: {
  itineraryId: string;
  /** The day the current stay item lives on, if any — a suggestion card's
   * "Add to trip" replaces that stay (research.md D6); falls back to day 1
   * when the trip has no stay yet. */
  currentStayDayNumber: number | null;
  onItineraryUpdated: (itinerary: AppliedOutcome["itinerary"], fit: AppliedOutcome["fit"]) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftText, setDraftText] = useState("");
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [applyingOfferId, setApplyingOfferId] = useState<string | null>(null);
  const nextId = useRef(0);

  const activeSubscription = useRef<{ unsubscribe: () => void } | null>(null);
  useEffect(() => {
    return () => {
      activeSubscription.current?.unsubscribe();
      activeSubscription.current = null;
    };
  }, []);

  function appendMessage(entry: Omit<ChatMessage, "id">) {
    nextId.current += 1;
    setMessages((current) => [...current, { ...entry, id: nextId.current }]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draftText.trim();
    if (!text || phase === "thinking") return;
    appendMessage({ role: "agent", text });
    setDraftText("");
    activeSubscription.current?.unsubscribe();
    setPhase("thinking");
    activeSubscription.current = trpc.workspace.itinerary.chatEdit.subscribe(
      { itineraryId, message: text },
      {
        onData(event: ChatEditEvent) {
          if (event.type === "progress") return;
          setPhase("idle");
          const outcome = event.outcome;
          if (outcome.status === "applied") {
            appendMessage({ role: "assistant", text: outcome.reply });
            onItineraryUpdated(outcome.itinerary, outcome.fit);
          } else if (outcome.status === "suggested") {
            appendMessage({ role: "assistant", text: outcome.reply, suggestions: outcome.suggestions });
          } else if (outcome.status === "no_change") {
            appendMessage({ role: "assistant", text: outcome.reply });
          } else if (outcome.status === "not_found") {
            appendMessage({ role: "assistant", text: "I couldn't find this trip anymore." });
          } else {
            appendMessage({ role: "assistant", text: "Something went wrong interpreting that — try rephrasing." });
          }
        },
        onError() {
          setPhase("idle");
          appendMessage({ role: "assistant", text: "The connection was interrupted — try again." });
        },
        onComplete() {
          activeSubscription.current = null;
          setPhase((current) => (current === "thinking" ? "idle" : current));
        },
      },
    );
  }

  async function addSuggestion(suggestion: HotelSuggestion) {
    setApplyingOfferId(suggestion.offerId);
    try {
      const input: ApplyChatEditInput = {
        itineraryId,
        edit: { type: "addItem", dayNumber: currentStayDayNumber ?? 1, port: "hotel", offerId: suggestion.offerId },
      };
      const result = await trpc.workspace.itinerary.applyChatEdit.mutate(input);
      if (result.status === "applied") {
        appendMessage({ role: "assistant", text: `Added "${suggestion.title}" to your trip.` });
        onItineraryUpdated(result.itinerary, result.fit);
      } else if (result.status === "item_not_found") {
        appendMessage({ role: "assistant", text: "That item no longer exists — try asking again." });
      } else {
        appendMessage({ role: "assistant", text: "That option is no longer available — try asking again." });
      }
    } catch {
      appendMessage({ role: "assistant", text: "Couldn't add that hotel — try again." });
    } finally {
      setApplyingOfferId(null);
    }
  }

  return (
    <section className="tf-card tf-chat" data-testid="chat-panel" style={{ marginTop: "1.5rem" }}>
      <p className="tf-eyebrow">Refine with chat</p>
      <h3>Ask to add, remove, or swap something</h3>
      <div className="tf-chat-messages" data-testid="chat-messages" aria-live="polite">
        {messages.length === 0 ? (
          <p className="tf-chat-empty">Try &quot;add a food tour on day 2&quot;, &quot;remove the museum&quot;, or &quot;suggest a hotel&quot;.</p>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className={`tf-chat-message tf-chat-message--${message.role}`} data-testid="chat-message" data-role={message.role}>
            <p>{message.text}</p>
            {message.suggestions && message.suggestions.length > 0 ? (
              <div className="tf-chat-suggestions" data-testid="hotel-suggestions">
                {message.suggestions.map((suggestion) => (
                  <article key={suggestion.offerId} className="tf-chat-suggestion-card" data-testid="hotel-suggestion-card">
                    <p className="tf-chat-suggestion-title">{suggestion.title}</p>
                    <p className="tf-price">{formatMinorAmount(suggestion.priceMinor, suggestion.currency)}</p>
                    <button
                      type="button"
                      className="tf-btn--cta"
                      disabled={applyingOfferId === suggestion.offerId}
                      onClick={() => addSuggestion(suggestion)}
                    >
                      {applyingOfferId === suggestion.offerId ? "Adding…" : "Add to trip"}
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {phase === "thinking" ? (
          <p className="tf-chat-thinking" aria-live="polite" data-testid="chat-thinking">
            <span className="tf-spin" aria-hidden="true" />
            Thinking…
          </p>
        ) : null}
      </div>
      <form onSubmit={handleSubmit} className="tf-chat-form">
        <input
          type="text"
          data-testid="chat-input"
          placeholder='e.g. "add a food tour on day 2"'
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          disabled={phase === "thinking"}
        />
        <button type="submit" className="tf-btn--cta" disabled={phase === "thinking" || draftText.trim().length === 0}>
          Send
        </button>
      </form>
    </section>
  );
}
