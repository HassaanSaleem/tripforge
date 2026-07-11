// Shared day-by-day itinerary rendering (spec 012 research D5) — extracted
// from the planner's DraftResult so a freshly drafted trip and a reopened one
// read identically (same .tf-day kit). Purely presentational: amounts are
// server-provided minor units through formatMinorAmount only (FR-009); the
// budget-fit table stays with the draft outcome, which is the only place fit
// data exists.
import { formatMinorAmount } from "../../../lib/planner-form.js";
import type { DraftedItinerary } from "../../../lib/booking-flow.js";

export function ItineraryDays({ days }: { days: DraftedItinerary["days"] }) {
  return (
    <>
      {days.map((day) => (
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
          {day.items.length === 0 ? (
            <p className="tf-empty-day">No items planned.</p>
          ) : (
            <ul className="tf-items">
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
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </>
  );
}
