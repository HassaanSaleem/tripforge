// The pure traveler-fork transform (spec 041 FR-004/005; bound a, GOAL.md
// 2026-07-27): a traveler forks a marketplace listing into their OWN working
// copy of the trip. Pure — no I/O, no randomness; the caller supplies the copy's
// id.
//
// Contrast with whiteLabelCopy (white-label.ts), the AGENT resale transform:
//   - whiteLabelCopy RE-HOMES the copy to a *reseller* agency and STAMPS
//     license terms + revenue-share + rebrand lineage into provenance (a trade).
//   - travelerForkCopy does NEITHER. The copy stays owned by the ORIGINATING
//     (seller) agency (agencyId unchanged) and provenance is untouched — a fork
//     is not a license and not a resale, so it must not alter ownership or
//     revenue-share semantics (Constitution VI). The only change is a fresh id.
// The signed-in traveler is attached to the copy OUTSIDE this transform via the
// existing client_trip_link (spec 031), never as a new itinerary owner.
import type { Itinerary } from "@tripforge/itinerary-schema";

export interface TravelerForkOptions {
  /** App-generated uuid — becomes both the copy's document id and its row id. */
  readonly copyId: string;
}

export function travelerForkCopy(source: Itinerary, opts: TravelerForkOptions): Itinerary {
  return {
    ...source,
    id: opts.copyId,
    // agencyId, provenance, days, items, media, title, currency: all verbatim.
    // The fork's OWN provenance (which listing/source/traveler) is recorded in
    // the marketplace_fork bolt-on row, never in the canonical document.
  };
}
