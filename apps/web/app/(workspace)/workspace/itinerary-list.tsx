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
import { useEffect, useMemo, useState } from "react";
import { trpc, type GetItineraryOutput, type MediaAsset, type MyItinerariesOutput } from "../../../lib/trpc/client.js";
import {
  bookedSummaryLabel,
  formatCreatedDate,
  formatLicensedCopyBadge,
  formatListedBadge,
  formatOriginBadge,
  listErrorMessage,
  openErrorMessage,
  realizedMarkupLabel,
} from "../../../lib/itinerary-list.js";
import { attachMediaErrorMessage } from "../../../lib/media-library.js";
import { BookingFlow } from "./booking-flow.js";
import { FlightsCard } from "./flights-card.js";
import { ItineraryDays, type ItemMediaControls } from "./itinerary-days.js";
import { ManualItineraryForm } from "./manual-itinerary-form.js";
import { ShareControl } from "./share-control.js";
import { MediaThumbImage } from "../../components/media-thumb-image.js";

type MyItinerary = MyItinerariesOutput["itineraries"][number];

// The "found" branch only — a corrupted document (status "invalid",
// seed-0021, a typed data value) or a vanished row (status "not_found",
// still a THROWN TRPCError — router-unchanged) never reaches the opened
// view; both resolve to the same "failed" panel state below.
type FoundItineraryOverview = Extract<GetItineraryOutput, { status: "found" }>;

type ListState =
  | { phase: "loading" }
  | { phase: "loaded"; itineraries: MyItinerary[] }
  | { phase: "failed"; message: string };

type OpenState =
  | null
  | { itineraryId: string; kind: "loading" }
  | { itineraryId: string; kind: "opened"; overview: FoundItineraryOverview }
  | { itineraryId: string; kind: "failed"; message: string };

/**
 * The agency's itineraries, newest first, with an open-in-place continue-work
 * view. Loads once on mount — now that Trips is its own nav destination
 * (spec 017 research D2), navigating here from the AI Builder after a draft
 * is itself a fresh mount, which is what previously needed the planner's
 * onDrafted signal.
 */
export function ItineraryList() {
  const [list, setList] = useState<ListState>({ phase: "loading" });
  const [open, setOpen] = useState<OpenState>(null);
  const [building, setBuilding] = useState(false);

  async function loadTrips() {
    try {
      const outcome = await trpc.workspace.itinerary.list.query();
      setList({ phase: "loaded", itineraries: outcome.itineraries });
    } catch (error) {
      setList({ phase: "failed", message: listErrorMessage(error) });
    }
  }

  useEffect(() => {
    void loadTrips();
  }, []);

  async function handleOpen(itineraryId: string) {
    if (open?.kind === "loading") return;
    setOpen({ itineraryId, kind: "loading" });
    try {
      const overview = await trpc.workspace.itinerary.get.query({ itineraryId });
      // not_found stays a THROWN TRPCError (router-unchanged, unreachable
      // here as data) — the catch block below + openErrorMessage already
      // cover it. Only "invalid" (seed-0021) is a new typed data branch.
      if (overview.status === "invalid") {
        setOpen({ itineraryId, kind: "failed", message: overview.diagnostic });
        return;
      }
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

  if (building) {
    return (
      <ManualItineraryForm
        onCancel={() => setBuilding(false)}
        onCreated={(itineraryId) => {
          setBuilding(false);
          void loadTrips();
          void handleOpen(itineraryId);
        }}
      />
    );
  }

  return (
    <section className="tf-card tf-triplist" data-testid="trips-panel">
      <p className="tf-eyebrow">Your trips</p>
      <h2>Trips in your workspace</h2>
      <button type="button" className="tf-btn--ghost" data-testid="trip-build-manual" onClick={() => setBuilding(true)}>
        + Build a trip manually
      </button>

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
              <span className="tf-badge" data-testid="trip-currency">{trip.currency}</span>
              {trip.licensedCopy ? (
                <span className="tf-badge tf-badge--licensed" data-testid="trip-licensed-copy">
                  {formatLicensedCopyBadge(trip.licensedCopy)}
                </span>
              ) : null}
              {trip.origin ? (
                <span className="tf-badge tf-badge--origin" data-testid="trip-origin">
                  {formatOriginBadge(trip.origin)}
                </span>
              ) : null}
              {trip.listing ? (
                <span className="tf-badge tf-badge--listed" data-testid="trip-listed">
                  {formatListedBadge(trip.listing)}
                </span>
              ) : null}
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
  overview: FoundItineraryOverview;
  itineraryId: string;
  onBack: () => void;
}) {
  const [itinerary, setItinerary] = useState(overview.itinerary);
  const { bookings, bookedItemIds, latestBookedMarkupBps, tripRequest } = overview;
  // The booked set + realized markup come from the ORIGINAL overview read
  // (seed-0027): same reopen-to-refresh cadence the `bookings` note above
  // already has — a booking made in this open session shows once the trip
  // is reopened, not live (BookingFlow's own confirmation card is the
  // in-session witness).
  const bookedItemIdSet = useMemo(() => new Set(bookedItemIds), [bookedItemIds]);
  const totalItemCount = useMemo(
    () => itinerary.days.reduce((count, day) => count + day.items.length, 0),
    [itinerary],
  );
  const markupNote = realizedMarkupLabel(latestBookedMarkupBps);
  const [libraryAssets, setLibraryAssets] = useState<MediaAsset[]>([]);
  const [attachingKey, setAttachingKey] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    setItinerary(overview.itinerary);
  }, [overview.itinerary]);

  useEffect(() => {
    let cancelled = false;
    async function loadLibrary() {
      try {
        const outcome = await trpc.workspace.media.list.query();
        if (!cancelled) setLibraryAssets(outcome.assets);
      } catch {
        // Non-fatal: the attach pickers just show nothing to add; the rest
        // of the trip view (days, booking, share) is unaffected.
      }
    }
    void loadLibrary();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshItinerary() {
    const fresh = await trpc.workspace.itinerary.get.query({ itineraryId });
    // A mid-session invalid/not_found is an extremely rare race (the document
    // was valid when this trip was opened); leave the last-known-good view
    // in place rather than crash the panel.
    if (fresh.status === "found") setItinerary(fresh.itinerary);
  }

  async function handleAttach(target: { scope: "gallery" } | { scope: "item"; itemId: string }, mediaAssetId: string) {
    const key = target.scope === "gallery" ? "gallery" : `item:${target.itemId}`;
    setAttachingKey(key);
    setMediaError(null);
    try {
      await trpc.workspace.itinerary.attachMedia.mutate({ itineraryId, mediaAssetId, target });
      await refreshItinerary();
    } catch (error) {
      setMediaError(attachMediaErrorMessage(error));
    } finally {
      setAttachingKey(null);
    }
  }

  async function handleDetach(target: { scope: "gallery" } | { scope: "item"; itemId: string }, mediaRefId: string) {
    setMediaError(null);
    try {
      await trpc.workspace.itinerary.detachMedia.mutate({ itineraryId, mediaRefId, target });
      await refreshItinerary();
    } catch (error) {
      setMediaError(attachMediaErrorMessage(error));
    }
  }

  const itemMediaControls: ItemMediaControls = {
    assets: libraryAssets,
    attachingKey,
    onAttach: (itemId, mediaAssetId) => void handleAttach({ scope: "item", itemId }, mediaAssetId),
    onDetach: (itemId, mediaRefId) => void handleDetach({ scope: "item", itemId }, mediaRefId),
  };

  const galleryAttached = new Set(itinerary.media.map((ref) => ref.id));
  const galleryAvailable = libraryAssets.filter((asset) => !galleryAttached.has(asset.id));

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
        <>
          {/* Booked/remaining summary + realized markup (seed-0027): driven by
              the server's own bookedItemIds/latestBookedMarkupBps, visible
              without running a fresh quote. */}
          <p className="tf-trip-note" data-testid="opened-booked-summary">
            {bookedSummaryLabel(bookedItemIdSet.size, totalItemCount)}
            {markupNote ? ` ${markupNote}` : ""}
          </p>
          <p className="tf-trip-note" data-testid="opened-bookings">
            {/* Booking truth verbatim from the platform's own response — status
                strings are never remapped or inferred client-side. */}
            Bookings on this trip:{" "}
            {bookings.map((b) => `${b.status} (${formatCreatedDate(b.createdAt)})`).join(", ")}
          </p>
        </>
      ) : null}

      {mediaError ? <p role="alert">{mediaError}</p> : null}
      <div data-testid="trip-gallery">
        <p className="tf-eyebrow">Gallery</p>
        {itinerary.media.length > 0 ? (
          <ul className="tf-media-gallery" data-testid="trip-gallery-list">
            {itinerary.media.map((ref) => (
              <li key={ref.id} className="tf-media-gallery-item">
                {ref.kind === "image" ? (
                  <MediaThumbImage src={ref.url} alt={ref.alt} />
                ) : (
                  <a href={ref.url} target="_blank" rel="noreferrer" className="tf-media-thumb tf-media-thumb--link">
                    ▶
                  </a>
                )}
                <button
                  type="button"
                  className="tf-btn--ghost tf-media-remove"
                  aria-label={`Remove ${ref.alt} from the gallery`}
                  data-testid="trip-gallery-detach"
                  onClick={() => void handleDetach({ scope: "gallery" }, ref.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tf-empty-day">No gallery photos yet.</p>
        )}
        {galleryAvailable.length > 0 ? (
          <label className="tf-media-attach" aria-label="Attach a photo to the gallery">
            <select
              defaultValue=""
              disabled={attachingKey === "gallery"}
              data-testid="trip-gallery-picker"
              onChange={(event) => {
                const mediaAssetId = event.target.value;
                if (mediaAssetId) void handleAttach({ scope: "gallery" }, mediaAssetId);
                event.target.value = "";
              }}
            >
              <option value="" disabled>
                {attachingKey === "gallery" ? "Attaching…" : "+ Add to gallery"}
              </option>
              {galleryAvailable.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.alt}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <ItineraryDays days={itinerary.days} mediaControls={itemMediaControls} bookedItemIds={bookedItemIdSet} />

      <FlightsCard
        destination={tripRequest.destination}
        checkIn={tripRequest.checkIn}
        checkOut={tripRequest.checkOut}
        currency={itinerary.currency}
        flightsBudget={itinerary.pricing.categories.find((c) => c.category === "flightsTransport")?.allocated}
      />
      {/* Same composition rule as the planner's drafted state (spec 009 D2,
          extended by spec 012 D4): booking + share render only inside a
          verified agent's workspace surface; keyed so opening another trip
          resets both flows. */}
      <BookingFlow key={itineraryId} itinerary={itinerary} latestBookedMarkupBps={latestBookedMarkupBps} />
      <ShareControl key={`share-${itineraryId}`} itineraryId={itineraryId} />
    </section>
  );
}
