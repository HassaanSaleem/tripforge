// Deterministic sandbox activity/tickets adapter (Constitution V / INV-019).
// Prices in EUR on purpose: multi-currency is a port-family property (INV-009,
// research D11). MoR placeholder: commission-model aggregators collect from the
// traveler, so the supplier side is merchant of record (research D7).
import { money } from "@tripforge/domain";
import type { ActivityOffer, ActivityPort, ActivitySearchCriteria } from "../ports/activity.js";
import { SANDBOX_FAIL_BOOK_OFFER_ID, SandboxPortAdapter, SandboxSupplyEngine } from "./engine.js";
import { lookupCuratedCity } from "./curated-catalog.js";

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
    const curated = lookupCuratedCity(criteria.destination);
    if (curated) {
      return this.engine.register(
        curated.activities.map((activity, i) => ({
          offerId: `${base}-curated-act-${i + 1}`,
          content: {
            title: activity.title,
            description: activity.description,
            // Dynamically-grounded catalogs carry no licensed imagery.
            ...(activity.imageUrl ? { imageUrl: activity.imageUrl, attribution: activity.attribution } : {}),
          },
          netRate: money(activity.netRateMinor, activity.currency),
          durationMinutes: activity.durationMinutes,
        })),
      );
    }
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
