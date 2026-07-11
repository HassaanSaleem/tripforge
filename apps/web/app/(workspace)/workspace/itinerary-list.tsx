// Workspace trips panel (spec 012 contract §2–§4) — client component driving
// the EXISTING agent-gated workspace.itinerary.list/get reads through the
// typed browser tRPC client (research D1). Rows render exactly as returned —
// order preserved (server is newest-first), no client-side money arithmetic
// (FR-009: amounts pass through formatMinorAmount only). The open/continue
// view composes the EXISTING BookingFlow + ShareControl (research D4) under
// the same verified-agent gate as the planner (INV-024; authorization stays
// per procedure, INV-023). Every user-visible failure string comes from the
// pure helpers in lib/itinerary-list.ts (FR-008). Presentation rides the
// seed-0009s theme kit (.tf-*).
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trpc, type GetItineraryOutput, type MyItinerariesOutput } from "../../../lib/trpc/client.js";
import { formatCreatedDate, listErrorMessage, openErrorMessage } from "../../../lib/itinerary-list.js";
import { BookingFlow } from "./booking-flow.js";
import { ItineraryDays } from "./itinerary-days.js";
import { ShareControl } from "./share-control.js";

type MyItinerary = MyItinerariesOutput["itineraries"][number];

type ListState =
  | { phase: "loading" }
  | { phase: "loaded"; itineraries: MyItinerary[] }
  | { phase: "failed"; message: string };

type OpenState =
  | null
  | { itineraryId: string; kind: "loading" }
  | { itineraryId: string; kind: "opened"; overview: GetItineraryOutput }
  | { itineraryId: string; kind: "failed"; message: string };

/**
 * The agency's itineraries, newest first, with an open-in-place continue-work
 * view. `refreshToken` re-runs the list load (bumped by the planner's
 * onDrafted signal — research D2, the seed-0016 staleness lesson); a bump
 * never disturbs an opened trip (data-model state machine).
 */
export function ItineraryList({ refreshToken }: { refreshToken: number }) {
  const [list, setList] = useState<ListState>({ phase: "loading" });
  const [open, setOpen] = useState<OpenState>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTrips() {
      try {
        const outcome = await trpc.workspace.itinerary.list.query();
        if (!cancelled) setList({ phase: "loaded", itineraries: outcome.itineraries });
      } catch (error) {
        if (!cancelled) setList({ phase: "failed", message: listErrorMessage(error) });
      }
    }
    void loadTrips();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  async function handleOpen(itineraryId: string) {
    if (open?.kind === "loading") return;
    setOpen({ itineraryId, kind: "loading" });
    try {
      const overview = await trpc.workspace.itinerary.get.query({ itineraryId });
      setOpen({ itineraryId, kind: "opened", overview });
    } catch (error) {
      setOpen({ itineraryId, kind: "failed", message: openErrorMessage(error) });
    }
  }

  if (open?.kind === "opened") {
    return (
      <OpenedTrip
        overview={open.overview}
        itineraryId={open.itineraryId}
        onBack={() => setOpen(null)}
      />
    );
  }

  return (
    <section className="tf-card tf-triplist" data-testid="trips-panel">
      <p className="tf-eyebrow">Your trips</p>
      <h2>Trips in your workspace</h2>

      {open?.kind === "failed" ? <p role="alert">{open.message}</p> : null}

      {list.phase === "loading" ? (
        <p className="tf-trip-note" aria-live="polite">
          Loading your trips…
        </p>
      ) : null}

      {list.phase === "failed" ? <p role="alert">{list.message}</p> : null}

      {list.phase === "loaded" && list.itineraries.length === 0 ? (
        <p className="tf-trip-note" data-testid="trips-empty">
          Nothing here yet. Draft a trip with the planner above, or license a
          finished one on the <Link href="/marketplace">marketplace</Link> —
          it lands here as your own white-label copy.
        </p>
      ) : null}

      {list.phase === "loaded" && list.itineraries.length > 0 ? (
        <ul>
          {list.itineraries.map((trip) => (
            <li key={trip.id} className="tf-trip-row" data-testid="trip-row">
              <b>{trip.title}</b>
              <span className="tf-badge">{trip.currency}</span>
              <time dateTime={trip.createdAt}>{formatCreatedDate(trip.createdAt)}</time>
              <button
                type="button"
                className="tf-btn--ghost"
                data-testid="trip-open"
                disabled={open?.kind === "loading"}
                onClick={() => void handleOpen(trip.id)}
              >
                {open?.kind === "loading" && open.itineraryId === trip.id ? "Opening…" : "Open"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function OpenedTrip({
  overview,
  itineraryId,
  onBack,
}: {
  overview: GetItineraryOutput;
  itineraryId: string;
  onBack: () => void;
}) {
  const { itinerary, bookings } = overview;
  return (
    <section className="tf-card tf-triplist" data-testid="opened-trip">
      <div className="tf-trip-openhead">
        <button type="button" className="tf-btn--ghost" data-testid="trips-back" onClick={onBack}>
          ← Back to trips
        </button>
        <p className="tf-eyebrow">Continue work</p>
      </div>
      <h2>{itinerary.title}</h2>
      {bookings.length > 0 ? (
        <p className="tf-trip-note" data-testid="opened-bookings">
          {/* Booking truth verbatim from the platform's own response — status
              strings are never remapped or inferred client-side. */}
          Bookings on this trip:{" "}
          {bookings.map((b) => `${b.status} (${formatCreatedDate(b.createdAt)})`).join(", ")}
        </p>
      ) : null}
      <ItineraryDays days={itinerary.days} />
      {/* Same composition rule as the planner's drafted state (spec 009 D2,
          extended by spec 012 D4): booking + share render only inside a
          verified agent's workspace surface; keyed so opening another trip
          resets both flows. */}
      <BookingFlow key={itineraryId} itinerary={itinerary} />
      <ShareControl key={`share-${itineraryId}`} itineraryId={itineraryId} />
    </section>
  );
}
