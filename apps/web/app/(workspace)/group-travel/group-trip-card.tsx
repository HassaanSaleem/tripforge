// Browse/departure-grid card — one image-forward card per active group
// departure (join or cancel action), split out of group-travel-panel.tsx
// (file-length quality-sweep precedent, marketplace listing-browse.tsx).
"use client";

import { useState, type FormEvent } from "react";
import { formatSeatPrice, formatSeatsRemaining } from "../../../lib/group-travel-flow.js";
import type { GroupDeparture } from "../../../lib/group-travel-flow.js";
import type { CancelState, JoinState } from "./group-travel-panel-types.js";

export function GroupTripCard({
  departure,
  join,
  onJoin,
  cancel,
  onCancel,
}: {
  departure: GroupDeparture;
  join: JoinState;
  onJoin: (departureId: string, travelerName: string, travelerEmail: string) => void;
  cancel: CancelState;
  onCancel: (departureId: string) => void;
}) {
  const active = join !== null && join.departureId === departure.departureId;
  const busy = join?.kind === "busy";
  const activeCancel = cancel !== null && cancel.departureId === departure.departureId;
  const cancelling = cancel?.kind === "busy";
  const soldOut = departure.seatsRemaining === 0;

  return (
    <article className="tf-market-card" data-testid="group-trip-card">
      <h3>{departure.itineraryTitle}</h3>
      <p className="tf-market-seller">
        by <b>{departure.postingAgencyName}</b>{" "}
        {departure.sellerVetted ? (
          <span className="tf-badge tf-badge--verified" data-testid="seller-verified-badge">
            Verified
          </span>
        ) : null}
      </p>
      <p className="tf-market-meta">
        Departs {new Date(departure.departureDate).toLocaleDateString("en", { dateStyle: "medium" })}
      </p>
      <p className="tf-price tf-market-price">{formatSeatPrice(departure.pricePerSeatMinor, departure.currency)}</p>
      <div className="tf-market-meta">
        <span
          className={soldOut ? "tf-badge tf-badge--sold-out" : "tf-badge"}
          data-testid="seats-remaining"
        >
          {formatSeatsRemaining(departure.seatsRemaining, departure.capacity)}
        </span>
        {departure.mine ? <span className="tf-badge tf-market-mine">Your departure</span> : null}
      </div>
      {departure.mine ? (
        <>
          <button
            type="button"
            className="tf-btn--ghost"
            data-testid="cancel-departure"
            disabled={cancelling}
            onClick={() => onCancel(departure.departureId)}
          >
            {activeCancel && cancelling ? "Cancelling…" : "Cancel departure"}
          </button>
          {activeCancel && cancel.kind === "refused" ? <p role="alert">{cancel.message}</p> : null}
        </>
      ) : null}
      {/* Join is available on EVERY active departure, including the posting
          agency's own (B2B2C — the ticket's core case: the SAME agency both
          posts a departure and sells its seats directly to their own
          clients). Unlike marketplace licensing, "mine" is not a self-
          dealing restriction here — joinGroupDeparture never refuses the
          posting agency. */}
      <JoinControl
        departureId={departure.departureId}
        soldOut={soldOut}
        join={join}
        active={active}
        busy={busy}
        onJoin={onJoin}
      />
    </article>
  );
}

function JoinControl({
  departureId,
  soldOut,
  join,
  active,
  busy,
  onJoin,
}: {
  departureId: string;
  soldOut: boolean;
  join: JoinState;
  active: boolean;
  busy: boolean;
  onJoin: (departureId: string, travelerName: string, travelerEmail: string) => void;
}) {
  const [travelerName, setTravelerName] = useState("");
  const [travelerEmail, setTravelerEmail] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    onJoin(departureId, travelerName, travelerEmail);
  }

  const justJoined = active && join?.kind === "joined";

  // A departure can be joined for MULTIPLE clients (one seat per submit), so
  // a successful join must NOT permanently replace the form — only a true
  // sold-out (capacity exhausted AND this actor didn't just take the last
  // seat themselves) hides it. When this actor's own join happens to be the
  // one that sold it out, show their confirmation instead of the generic
  // sold-out message (their action earned that feedback).
  if (soldOut && !justJoined) {
    return <p data-testid="departure-sold-out">Sold out — no seats remain.</p>;
  }
  if (soldOut && justJoined) {
    return <p data-testid="join-confirmed">Seat joined — {join.seatsRemaining} left.</p>;
  }

  return (
    <form className="tf-market-rate" data-testid="join-departure-form" onSubmit={handleSubmit}>
      <label htmlFor={`travelerName-${departureId}`}>
        Client name
        <input
          id={`travelerName-${departureId}`}
          type="text"
          value={travelerName}
          disabled={busy}
          onChange={(e) => setTravelerName(e.target.value)}
        />
      </label>
      <label htmlFor={`travelerEmail-${departureId}`}>
        Client email (optional)
        <input
          id={`travelerEmail-${departureId}`}
          type="email"
          value={travelerEmail}
          disabled={busy}
          onChange={(e) => setTravelerEmail(e.target.value)}
        />
      </label>
      <button type="submit" className="tf-btn--cta" disabled={busy}>
        {active && busy ? "Joining…" : "Join a seat"}
      </button>
      {justJoined ? <p data-testid="join-confirmed">Seat joined — {join.seatsRemaining} left.</p> : null}
      {active && join?.kind === "refused" ? <p role="alert">{join.message}</p> : null}
    </form>
  );
}
