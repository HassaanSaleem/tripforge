// Deterministic sandbox activity/tickets adapter (Constitution V / INV-019).
// Prices in EUR on purpose: multi-currency is a port-family property (INV-009,
// research D11). MoR placeholder: commission-model aggregators collect from the
// traveler, so the supplier side is merchant of record (research D7).
import { money } from "@tripforge/domain";
import type { ActivityOffer, ActivityPort, ActivitySearchCriteria } from "../ports/activity.js";
import { SANDBOX_FAIL_BOOK_OFFER_ID, SandboxPortAdapter, SandboxSupplyEngine } from "./engine.js";

const QUOTE_HOLD_MS = 30 * 60 * 1000;

export class SandboxActivityAdapter
  extends SandboxPortAdapter<ActivityOffer>
  implements ActivityPort
{
  constructor(now: () => number = () => Date.now()) {
    const engine = new SandboxSupplyEngine<ActivityOffer>({
      component: "activity",
      holdMs: QUOTE_HOLD_MS,
      merchantOfRecord: "supplier",
      now,
    });
    engine.register([
      {
        offerId: SANDBOX_FAIL_BOOK_OFFER_ID,
        content: { title: "Sandbox Always-Fails Activity" },
        netRate: money(3_300, "EUR"),
      },
    ]);
    super(engine);
  }

  async search(criteria: ActivitySearchCriteria): Promise<ActivityOffer[]> {
    if (criteria.destination.trim() === "") {
      return [];
    }
    const base = criteria.destination.toLowerCase();
    return this.engine.register([
      {
        offerId: `${base}-act-001`,
        content: { title: `${criteria.destination} Old Town Walking Tour`, features: ["guide"] },
        netRate: money(4_500, "EUR"),
        durationMinutes: 90,
      },
      {
        offerId: `${base}-act-002`,
        content: { title: `${criteria.destination} River Cruise`, features: ["audio-guide"] },
        netRate: money(7_000, "EUR"),
        durationMinutes: 120,
      },
    ]);
  }
}
