// Supplier-agnostic CAR RENTAL port (Constitution V, INV-005) — the
// CarTrawler-type/GDS class of the P0 component map (PRD §9.3), behind OUR
// contract shapes only.
//
// D-006 boundary: this port exists at the supply boundary ONLY. Canonical
// itinerary schema v0 has no carRental item kind and supplyRef.port has no
// "car" member — itinerary-item linkage for car rental is deferred to an
// operator-gated schema version bump (FR-012). The planner's quote_car_rental
// tool (INV-013) and the budget allocator can still price against this port.
import type { OfferBase, QuoteBase, SupplyPort } from "./common.js";

export interface CarRentalSearchCriteria {
  pickupLocation: string;
  /** Defaults to pickupLocation (round-trip rental) when omitted. */
  dropoffLocation?: string;
  /** ISO datetimes. */
  pickupAt: string;
  dropoffAt: string;
  driverAge?: number;
}

export type CarRentalOffer = OfferBase & {
  vehicleClass: string;
};

export type CarRentalQuote = QuoteBase;

export type CarRentalPort = SupplyPort<CarRentalSearchCriteria, CarRentalOffer, CarRentalQuote>;
