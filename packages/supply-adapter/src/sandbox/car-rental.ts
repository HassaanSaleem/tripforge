// Deterministic sandbox car-rental adapter (Constitution V / INV-019). Supply
// boundary only — no itinerary-item linkage at schema v0 (D-006, see the port).
import { money } from "@tripforge/domain";
import type {
  CarRentalOffer,
  CarRentalPort,
  CarRentalQuote,
  CarRentalSearchCriteria,
} from "../ports/car-rental.js";
import type { BookingOutcome, CancelOutcome, QuoteOutcome } from "../ports/common.js";
import { SANDBOX_FAIL_BOOK_OFFER_ID, SandboxSupplyEngine } from "./engine.js";

const QUOTE_HOLD_MS = 20 * 60 * 1000;

export class SandboxCarRentalAdapter implements CarRentalPort {
  private readonly engine: SandboxSupplyEngine<CarRentalOffer>;

  constructor(now: () => number = () => Date.now()) {
    this.engine = new SandboxSupplyEngine<CarRentalOffer>({
      component: "car",
      holdMs: QUOTE_HOLD_MS,
      merchantOfRecord: "supplier",
      now,
    });
    this.engine.register([
      {
        offerId: SANDBOX_FAIL_BOOK_OFFER_ID,
        content: { title: "Sandbox Always-Fails Car Rental" },
        netRate: money(8_800, "EUR"),
        vehicleClass: "compact",
      },
    ]);
  }

  async search(criteria: CarRentalSearchCriteria): Promise<CarRentalOffer[]> {
    if (criteria.pickupLocation.trim() === "") {
      return [];
    }
    const base = criteria.pickupLocation.toLowerCase().replace(/\s+/g, "-");
    return this.engine.register([
      {
        offerId: `${base}-car-001`,
        content: { title: `Compact car — ${criteria.pickupLocation}`, features: ["a/c"] },
        netRate: money(22_000, "EUR"),
        vehicleClass: "compact",
      },
      {
        offerId: `${base}-car-002`,
        content: { title: `SUV — ${criteria.pickupLocation}`, features: ["a/c", "5 seats"] },
        netRate: money(35_000, "EUR"),
        vehicleClass: "suv",
      },
    ]);
  }

  async quote(offerId: string): Promise<QuoteOutcome<CarRentalQuote>> {
    return this.engine.quote(offerId);
  }

  async book(quoteId: string): Promise<BookingOutcome> {
    return this.engine.book(quoteId);
  }

  async cancel(bookingId: string): Promise<CancelOutcome> {
    return this.engine.cancel(bookingId);
  }

  /** Read-only supplier-state witness for conservation tests — see engine. */
  liveBookingIds(): string[] {
    return this.engine.liveBookingIds();
  }
}
