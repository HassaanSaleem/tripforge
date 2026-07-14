// Flights card (spec 026, ticket demo-10-flights-deeplink): read-only
// indicative options + a deep-link handoff to an external flight-search site.
// PRD §9.3 / Constitution V: flights are deep-link only, never merchant-of-
// record — this card creates no booking, no cart item, no payment path. Shared
// between the freshly-drafted result (planner.tsx) and a reopened trip
// (itinerary-list.tsx); both call sites already have or can cheaply read
// destination/checkIn/checkOut (spec 026 data-model.md).
import { buildFlightSearchUrl, indicativeFlightOptions } from "../../../lib/flights.js";
import { formatMinorAmount } from "../../../lib/planner-form.js";

export function FlightsCard({
  destination,
  checkIn,
  checkOut,
  currency,
  flightsBudget,
}: {
  destination: string;
  checkIn: string;
  checkOut: string;
  currency: string;
  /** The trip's already-allocated flightsTransport budget (read-only display
   * only — this card performs no money computation, FR-008). Absent only if
   * the category is somehow missing from the fit/pricing breakdown. */
  flightsBudget?: { amountMinor: number; currency: string };
}) {
  const options = indicativeFlightOptions(destination, checkIn, checkOut, currency);
  const searchUrl = buildFlightSearchUrl(destination, checkIn, checkOut);

  return (
    <section className="tf-card tf-flights-card" data-testid="flights-card" style={{ marginTop: "1.5rem" }}>
      <p className="tf-eyebrow">Flights</p>
      <h3>Indicative flight options</h3>
      <p className="tf-flights-note">
        Illustrative pricing to anchor your budget — not a live fare. TripForge never books or pays for flights;
        use the link below to search and book with a partner.
      </p>
      {flightsBudget ? (
        <p className="tf-trip-note" data-testid="flights-budget-reference">
          Your flights budget: <span className="tf-price">{formatMinorAmount(flightsBudget.amountMinor, flightsBudget.currency)}</span>
        </p>
      ) : null}
      <ul className="tf-flights-options" data-testid="flights-options">
        {options.map((option, i) => (
          <li key={`${option.airline}-${i}`} className="tf-flights-option">
            <span className="tf-flights-airline">{option.airline}</span>
            <span className="tf-flights-times">
              {option.departureLabel} · {option.returnLabel}
            </span>
            <span className="tf-price">{formatMinorAmount(option.priceMinor, option.currency)}</span>
          </li>
        ))}
      </ul>
      <a
        href={searchUrl}
        target="_blank"
        rel="noreferrer"
        className="tf-btn tf-btn--ghost"
        data-testid="flights-deep-link"
      >
        Search flights on partner ↗
      </a>
    </section>
  );
}
