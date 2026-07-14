// Shared UI-state types for the group-travel panel and its sibling components
// (browse grid, post form, join action) — split out so those siblings don't
// need to import from each other or from the orchestrator (marketplace-panel
// precedent).
import type { MyItinerariesOutput } from "../../../lib/trpc/client.js";
import type { GroupDeparture, PostFormValues } from "../../../lib/group-travel-flow.js";

export type MyItinerary = MyItinerariesOutput["itineraries"][number];

export type BrowseState =
  | { phase: "loading" }
  | { phase: "loaded"; departures: GroupDeparture[] }
  | { phase: "failed"; message: string };

export type PickerState =
  | { phase: "loading" }
  | { phase: "loaded"; itineraries: MyItinerary[] }
  | { phase: "failed"; message: string };

export type PostFormState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "posted" }
  | { phase: "refused"; message: string };

export type JoinState =
  | { departureId: string; kind: "busy" }
  | { departureId: string; kind: "joined"; seatsRemaining: number }
  | { departureId: string; kind: "refused"; message: string }
  | null;

export type CancelState =
  | { departureId: string; kind: "busy" }
  | { departureId: string; kind: "cancelled" }
  | { departureId: string; kind: "refused"; message: string }
  | null;

export const INITIAL_POST_FORM: PostFormValues = {
  itineraryId: "",
  departureDate: "",
  capacity: "",
  priceMajor: "",
};
