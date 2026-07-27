// Shared day-by-day itinerary rendering (spec 012 research D5) — extracted
// from the planner's DraftResult so a freshly drafted trip and a reopened one
// read identically (same .tf-day kit). Purely presentational: amounts are
// server-provided minor units through formatMinorAmount only (FR-009); the
// budget-fit table stays with the draft outcome, which is the only place fit
// data exists.
//
// `mediaControls` (spec 015 US2) is OPTIONAL and undefined at the planner's
// freshly-drafted call site (v0 scope: attach/detach happens on a reopened
// trip, which already has a stable itineraryId) — omitting it leaves that
// call site's rendering byte-identical to before this feature (SC-005 no
// regression).
import { formatMinorAmount } from "../../../lib/planner-form.js";
import type { DraftedItinerary } from "../../../lib/booking-flow.js";
import { stayCoveringDay } from "../../../lib/itinerary-days.js";
import type { MediaAsset } from "../../../lib/trpc/client.js";
import { MediaThumbImage } from "../../components/media-thumb-image.js";

export interface ItemMediaControls {
  assets: MediaAsset[];
  attachingKey: string | null;
  onAttach: (itemId: string, mediaAssetId: string) => void;
  onDetach: (itemId: string, mediaRefId: string) => void;
}

export function ItineraryDays({
  days,
  mediaControls,
  bookedItemIds,
}: {
  days: DraftedItinerary["days"];
  mediaControls?: ItemMediaControls;
  /** Item ids with a confirmed booking_component (seed-0027), server-derived
   * (`workspace.itinerary.get`'s `bookedItemIds`) — OPTIONAL and undefined at
   * the planner's freshly-drafted call site, which has no booking history to
   * mark (same opt-in convention as `mediaControls`). */
  bookedItemIds?: ReadonlySet<string>;
}) {
  return (
    <>
      {days.map((day) => {
        const covering = stayCoveringDay(days, day);
        return (
          <article key={day.dayNumber} className="tf-card tf-day">
            <div className="tf-day-head">
              <h3>
                Day {day.dayNumber}
                {day.date ? ` — ${day.date}` : ""}
              </h3>
              {day.subtotal ? (
                <span className="tf-day-subtotal tf-price">
                  Day subtotal: {formatMinorAmount(day.subtotal.amountMinor, day.subtotal.currency)}
                </span>
              ) : null}
            </div>
            {day.items.length === 0 && !covering ? (
              <p className="tf-empty-day">No items planned.</p>
            ) : (
              <ul className="tf-items">
                {covering ? (
                  <li className="tf-item-continuing" data-testid="stay-continuing">
                    <span className="d d--stay" aria-hidden="true" />
                    <span>
                      <span className="tf-item-kind">stay</span>: {covering.title}{" "}
                      <em className="tf-item-note">(continuing — check-out {covering.checkOut})</em>
                    </span>
                  </li>
                ) : null}
                {day.items.map((item) => (
                  <li key={item.id}>
                    <span className={`d d--${item.kind}`} aria-hidden="true" />
                    <span>
                      <span className="tf-item-kind">{item.kind}</span>: {item.title}
                      {item.pricing ? (
                        <span className="tf-price">
                          {" "}
                          — {formatMinorAmount(item.pricing.sellPrice.amountMinor, item.pricing.sellPrice.currency)}
                        </span>
                      ) : null}
                      {bookedItemIds?.has(item.id) ? (
                        <span className="tf-badge tf-badge--booked" data-testid="item-booked-badge">
                          Booked
                        </span>
                      ) : null}
                      {mediaControls ? (
                        <ItemMedia item={item} controls={mediaControls} />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </>
  );
}

function ItemMedia({
  item,
  controls,
}: {
  item: DraftedItinerary["days"][number]["items"][number];
  controls: ItemMediaControls;
}) {
  const attached = new Set(item.media.map((ref) => ref.id));
  const available = controls.assets.filter((asset) => !attached.has(asset.id));
  const attaching = controls.attachingKey === `item:${item.id}`;
  return (
    <div className="tf-item-media" data-testid="item-media">
      {item.media.map((ref) => (
        <span key={ref.id} className="tf-item-media-item">
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
            aria-label={`Remove ${ref.alt} from ${item.title}`}
            data-testid="item-media-detach"
            onClick={() => controls.onDetach(item.id, ref.id)}
          >
            ×
          </button>
        </span>
      ))}
      {available.length > 0 ? (
        <label className="tf-media-attach" aria-label={`Attach a photo to ${item.title}`}>
          <select
            defaultValue=""
            disabled={attaching}
            data-testid="item-media-picker"
            onChange={(event) => {
              const mediaAssetId = event.target.value;
              if (mediaAssetId) controls.onAttach(item.id, mediaAssetId);
              event.target.value = "";
            }}
          >
            <option value="" disabled>
              {attaching ? "Attaching…" : "+ Add photo"}
            </option>
            {available.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.alt}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
