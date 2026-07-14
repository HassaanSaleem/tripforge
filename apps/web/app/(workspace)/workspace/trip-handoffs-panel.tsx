// Workspace "Trip requests" inbox (spec 022 contracts §2/§3) — client
// component driving the agent-gated workspace.tripHandoffs.list/accept
// procedures through the typed browser tRPC client. Mirrors
// itinerary-list.tsx's loading/empty/loaded + status-badge +
// single-action-button shape (NOT the heavier group-travel-panel.tsx
// two-panel layout — this is a simple new/accepted inbox).
"use client";

import { useEffect, useState } from "react";
import { trpc, type ListTripHandoffsOutput } from "../../../lib/trpc/client.js";
import { formatCreatedDate } from "../../../lib/itinerary-list.js";
import { tripHandoffsErrorMessage } from "../../../lib/trip-handoffs.js";

type TripHandoffRequest = ListTripHandoffsOutput["requests"][number];

type ListState =
  | { phase: "loading" }
  | { phase: "loaded"; requests: TripHandoffRequest[] }
  | { phase: "failed"; message: string };

type AcceptState = null | { requestId: string; kind: "busy" } | { requestId: string; kind: "refused"; message: string };

export function TripHandoffsPanel() {
  const [list, setList] = useState<ListState>({ phase: "loading" });
  const [accept, setAccept] = useState<AcceptState>(null);

  async function loadRequests() {
    try {
      const outcome = await trpc.workspace.tripHandoffs.list.query();
      setList({ phase: "loaded", requests: outcome.requests });
    } catch (error) {
      setList({ phase: "failed", message: tripHandoffsErrorMessage(error) });
    }
  }

  useEffect(() => {
    void loadRequests();
  }, []);

  async function handleAccept(requestId: string) {
    if (accept?.kind === "busy") return;
    setAccept({ requestId, kind: "busy" });
    try {
      await trpc.workspace.tripHandoffs.accept.mutate({ requestId });
      await loadRequests();
      setAccept(null);
    } catch (error) {
      setAccept({ requestId, kind: "refused", message: tripHandoffsErrorMessage(error) });
    }
  }

  return (
    <section className="tf-card tf-triplist" data-testid="trip-handoffs-panel">
      <p className="tf-eyebrow">Trip requests</p>
      <h2>Clients asking for your help</h2>

      {list.phase === "loading" ? (
        <p className="tf-trip-note" aria-live="polite">
          Loading trip requests…
        </p>
      ) : null}

      {list.phase === "failed" ? <p role="alert">{list.message}</p> : null}

      {list.phase === "loaded" && list.requests.length === 0 ? (
        <p className="tf-trip-note" data-testid="trip-handoffs-empty">
          No requests yet. When a traveler chooses &quot;Have an agent arrange this for
          me&quot; on their shared trip, it shows up here.
        </p>
      ) : null}

      {list.phase === "loaded" && list.requests.length > 0 ? (
        <ul>
          {list.requests.map((request) => (
            <li key={request.id} className="tf-trip-row" data-testid="trip-handoff-row">
              <b>{request.contactName}</b>
              <span className="tf-badge">{request.itineraryTitle}</span>
              <span className={`tf-badge${request.status === "accepted" ? " tf-badge--listed" : ""}`}>
                {request.status === "accepted" ? "Accepted" : "New"}
              </span>
              {request.contactEmail ? <small>{request.contactEmail}</small> : null}
              {request.notes ? <small>{request.notes}</small> : null}
              <time dateTime={request.createdAt}>{formatCreatedDate(request.createdAt)}</time>
              {request.status === "new" ? (
                <button
                  type="button"
                  className="tf-btn--ghost"
                  data-testid="trip-handoff-accept"
                  disabled={accept?.kind === "busy" && accept.requestId === request.id}
                  onClick={() => void handleAccept(request.id)}
                >
                  {accept?.kind === "busy" && accept.requestId === request.id ? "Accepting…" : "Accept"}
                </button>
              ) : null}
              {accept?.kind === "refused" && accept.requestId === request.id ? (
                <p role="alert">{accept.message}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
