// Deterministic sandbox car-rental adapter (Constitution V / INV-019). Supply
// boundary only — no itinerary-item linkage at schema v0 (D-006, see the port).
import { money } from "@tripforge/domain";
import type {
  CarRentalOffer,
  CarRentalPort,
  CarRentalSearchCriteria,
} from "../ports/car-rental.js";
import { SANDBOX_FAIL_BOOK_OFFER_ID, SandboxPortAdapter, SandboxSupplyEngine } from "./engine.js";

const QUOTE_HOLD_MS = 20 * 60 * 1000;

export class SandboxCarRentalAdapter
  extends SandboxPortAdapter<CarRentalOffer>
  implements CarRentalPort
{
  constructor(now: () => number = () => Date.now()) {
    const engine = new SandboxSupplyEngine<CarRentalOffer>({
      component: "car",
      holdMs: QUOTE_HOLD_MS,
      merchantOfRecord: "supplier",
      now,
    });
    engine.register([
      {
        offerId: SANDBOX_FAIL_BOOK_OFFER_ID,
        content: { title: "Sandbox Always-Fails Car Rental" },
        netRate: money(8_800, "EUR"),
        vehicleClass: "compact",
      },
    ]);
    super(engine);
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
}
