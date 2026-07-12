// Deterministic sandbox transfer adapter (Constitution V / INV-019). Licensed
// third-party transfer providers only — never ride-hailing (PRD non-goal).
import { money } from "@tripforge/domain";
import type { TransferOffer, TransferPort, TransferSearchCriteria } from "../ports/transfer.js";
import { SANDBOX_FAIL_BOOK_OFFER_ID, SandboxPortAdapter, SandboxSupplyEngine } from "./engine.js";

const QUOTE_HOLD_MS = 10 * 60 * 1000;

export class SandboxTransferAdapter
  extends SandboxPortAdapter<TransferOffer>
  implements TransferPort
{
  constructor(now: () => number = () => Date.now()) {
    const engine = new SandboxSupplyEngine<TransferOffer>({
      component: "transfer",
      holdMs: QUOTE_HOLD_MS,
      merchantOfRecord: "supplier",
      now,
    });
    engine.register([
      {
        offerId: SANDBOX_FAIL_BOOK_OFFER_ID,
        content: { title: "Sandbox Always-Fails Transfer" },
        netRate: money(1_900, "USD"),
        mode: "private",
      },
    ]);
    super(engine);
  }

  async search(criteria: TransferSearchCriteria): Promise<TransferOffer[]> {
    if (criteria.from.trim() === "" || criteria.to.trim() === "") {
      return [];
    }
    const slug = (from: string, to: string) => `${from}-${to}`.toLowerCase().replace(/\s+/g, "-");
    const base = slug(criteria.from, criteria.to);
    // The planner tool boundary PINS search criteria to the trip's own
    // canonical direction (spec 008 FR-011) — a caller can never re-query
    // with swapped from/to. A round-trip transfer product naturally offers
    // the return leg too, so it rides the SAME search response, distinctly
    // offerId/titled (seed-0019 — lets a multi-day plan use a genuinely
    // different, correctly-directed offer for the departure leg instead of
    // reusing the arrival offer's id/title verbatim).
    const returnBase = slug(criteria.to, criteria.from);
    return this.engine.register([
      {
        offerId: `${base}-xfer-001`,
        content: { title: `Private transfer ${criteria.from} → ${criteria.to}` },
        netRate: money(6_500, "USD"),
        mode: "private",
      },
      {
        offerId: `${base}-xfer-002`,
        content: { title: `Shared shuttle ${criteria.from} → ${criteria.to}` },
        netRate: money(2_500, "USD"),
        mode: "shared",
      },
      {
        offerId: `${returnBase}-xfer-001-return`,
        content: { title: `Private transfer ${criteria.to} → ${criteria.from}` },
        netRate: money(6_500, "USD"),
        mode: "private",
      },
      {
        offerId: `${returnBase}-xfer-002-return`,
        content: { title: `Shared shuttle ${criteria.to} → ${criteria.from}` },
        netRate: money(2_500, "USD"),
        mode: "shared",
      },
    ]);
  }
}
