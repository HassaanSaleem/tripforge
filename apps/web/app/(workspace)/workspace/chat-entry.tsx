// Chat-first entry point (spec 028, promoted to the PRIMARY, multi-turn build
// path by spec 035). The agent builds a trip by CONVERSATION: each submit sends
// the latest turn PLUS the earlier turns of this unstarted build
// (`priorMessages`) to interpretChatRequest, which interprets the accumulated
// transcript (research.md D1) — so details supplied across several messages
// converge. On `needsInfo`, the clarifying reply is shown and the agent keeps
// going. On `resolved`, the component does NOT auto-draft: it OFFERS to proceed
// (research.md D3) with a confirmation summary + a "Build my trip" CTA that
// hands the resolved tripRequest to the SAME startDraft(...) the form uses
// (research.md D5) — zero forking of the compare-then-choose-then-book pipeline.
// Presentation rides the existing seed-0009s theme kit (.tf-*).
"use client";

import { useRef, useState, type FormEvent } from "react";
import { trpc, type DraftInput } from "../../../lib/trpc/client.js";
import { formatMinorAmount } from "../../../lib/planner-form.js";

interface ChatEntryMessage {
  id: number;
  role: "agent" | "assistant";
  text: string;
}

/** Whole-number nights between two ISO (YYYY-MM-DD, UTC) dates — no wall-clock
 * read, so the summary stays deterministic (keyless mode). */
function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
}

/** Human confirmation of what the conversation resolved to (spec 035 FR-002) —
 * display only; the actual prices/items still come from live supply when the
 * agent proceeds to draft. */
function summariseRequest(req: DraftInput): string {
  const nights = nightsBetween(req.checkIn, req.checkOut);
  const travellers = req.party.adults + req.party.children;
  const budget = formatMinorAmount(req.budget.amountMinor, req.budget.currency);
  const cap = req.budget.mode === "hardCap" ? "up to" : "around";
  const nightsLabel = `${nights} night${nights === 1 ? "" : "s"}`;
  const travellersLabel = `${travellers} traveller${travellers === 1 ? "" : "s"}`;
  const styleLabel = req.tripStyle ? `, ${req.tripStyle} style` : "";
  return `Here's what I've got: ${req.destination} · ${nightsLabel} · ${travellersLabel} · budget ${cap} ${budget}${styleLabel}. Ready to build it?`;
}

export function ChatEntry({ onResolved }: { onResolved: (tripRequest: DraftInput) => void }) {
  const [messages, setMessages] = useState<ChatEntryMessage[]>([]);
  // The agent's own turns so far (oldest first) — sent as `priorMessages` so the
  // server interprets the accumulated conversation, not just the latest message.
  const [agentTurns, setAgentTurns] = useState<string[]>([]);
  const [draftText, setDraftText] = useState("");
  const [thinking, setThinking] = useState(false);
  // The most recently resolved request awaiting the "Build my trip" CTA. Cleared
  // on every new turn so the CTA never drafts a stale, superseded understanding.
  const [resolved, setResolved] = useState<DraftInput | null>(null);
  const nextId = useRef(0);

  function appendMessage(entry: Omit<ChatEntryMessage, "id">) {
    nextId.current += 1;
    setMessages((current) => [...current, { ...entry, id: nextId.current }]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draftText.trim();
    if (!text || thinking) return;
    const priorMessages = agentTurns;
    appendMessage({ role: "agent", text });
    setAgentTurns((current) => [...current, text]);
    setDraftText("");
    setResolved(null); // a new turn supersedes any pending resolved request
    setThinking(true);
    try {
      const result = await trpc.workspace.itinerary.interpretChatRequest.mutate({
        message: text,
        ...(priorMessages.length > 0 ? { priorMessages } : {}),
      });
      if (result.status === "resolved") {
        setResolved(result.tripRequest);
        appendMessage({ role: "assistant", text: summariseRequest(result.tripRequest) });
        return;
      }
      if (result.status === "needsInfo") {
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

  return (
    <section className="tf-card tf-chat" data-testid="chat-entry">
      <p className="tf-eyebrow">Build by chatting</p>
      <h3>Describe the trip you want</h3>
      <div className="tf-chat-messages" data-testid="chat-entry-messages" aria-live="polite">
        {messages.length === 0 ? (
          <p className="tf-chat-empty">
            Try &quot;Plan a trip to Lisbon&quot; — I&apos;ll ask for anything I still need. Add
            the budget, dates, party or style whenever you like.
          </p>
        ) : null}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`tf-chat-message tf-chat-message--${message.role}`}
            data-testid="chat-entry-message"
            data-role={message.role}
          >
            <p>{message.text}</p>
          </div>
        ))}
        {thinking ? (
          <p className="tf-chat-thinking" aria-live="polite" data-testid="chat-entry-thinking">
            <span className="tf-spin" aria-hidden="true" />
            Thinking…
          </p>
        ) : null}
      </div>
      {resolved && !thinking ? (
        <div className="tf-chat-confirm" data-testid="chat-entry-confirm">
          <button
            type="button"
            className="tf-btn--cta"
            data-testid="chat-build-cta"
            onClick={() => onResolved(resolved)}
          >
            Build my trip
          </button>
          <span className="tf-field-hint">or keep chatting to adjust it</span>
        </div>
      ) : null}
      <form onSubmit={handleSubmit} className="tf-chat-form">
        <input
          type="text"
          data-testid="chat-entry-input"
          placeholder='e.g. "around EUR 2000 for 4 nights, 2 people"'
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          disabled={thinking}
        />
        <button type="submit" className="tf-btn--cta" disabled={thinking || draftText.trim().length === 0}>
          Send
        </button>
      </form>
    </section>
  );
}
