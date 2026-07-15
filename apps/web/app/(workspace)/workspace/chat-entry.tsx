// Chat-first entry point (spec 028 US1/US2) — an alternative to the
// structured form on the AI Builder's idle/landing view. Single-shot per
// message (research.md D6): each submit calls the non-streamed
// interpretChatRequest mutation and, on a `resolved` outcome, hands the
// returned tripRequest to the SAME startDraft(...) the form uses (research.md
// D5) — this component's own job ends there. On `needsInfo`, the reply is
// shown as an assistant-style message and the agent may retype. Presentation
// rides the existing seed-0009s theme kit (.tf-*), mirroring chat-panel.tsx's
// conventions.
"use client";

import { useRef, useState, type FormEvent } from "react";
import { trpc, type DraftInput } from "../../../lib/trpc/client.js";

interface ChatEntryMessage {
  id: number;
  role: "agent" | "assistant";
  text: string;
}

export function ChatEntry({ onResolved }: { onResolved: (tripRequest: DraftInput) => void }) {
  const [messages, setMessages] = useState<ChatEntryMessage[]>([]);
  const [draftText, setDraftText] = useState("");
  const [thinking, setThinking] = useState(false);
  const nextId = useRef(0);

  function appendMessage(entry: Omit<ChatEntryMessage, "id">) {
    nextId.current += 1;
    setMessages((current) => [...current, { ...entry, id: nextId.current }]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draftText.trim();
    if (!text || thinking) return;
    appendMessage({ role: "agent", text });
    setDraftText("");
    setThinking(true);
    try {
      const result = await trpc.workspace.itinerary.interpretChatRequest.mutate({ message: text });
      if (result.status === "resolved") {
        onResolved(result.tripRequest);
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
      <p className="tf-eyebrow">Or just chat</p>
      <h3>Describe the trip you want</h3>
      <div className="tf-chat-messages" data-testid="chat-entry-messages" aria-live="polite">
        {messages.length === 0 ? (
          <p className="tf-chat-empty">
            Try &quot;Plan 4 days in Lisbon for 2, EUR 2000, boutique stay&quot; — no form required.
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
      <form onSubmit={handleSubmit} className="tf-chat-form">
        <input
          type="text"
          data-testid="chat-entry-input"
          placeholder='e.g. "Plan 4 days in Lisbon for 2, EUR 2000"'
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
