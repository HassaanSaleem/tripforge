// Single source of truth for the SIGNED-IN traveler consumer navigation
// (spec 037, ticket goal-client-side-panel). Pure data — DOM-free so it is L1
// testable — consumed by both ClientNavSidebar (rendering) and every consumer
// page's activeNav prop (ClientSurfaceShell). Deliberately DISTINCT from the
// agent `lib/nav.ts` family: INV-024 separates navigation by user type, not by a
// flag on a shared component, and the traveler surface has a "coming soon"
// (not-yet-built) concept the agent nav has no notion of.
//
// `id` is exhaustive over ClientSurfaceShell's activeNav union: adding/removing a
// destination here without updating that type is a compile error, not a runtime
// gap (same discipline as NavDestinationId).
export type ClientNavDestinationId = "home" | "myTrips" | "plan" | "discover" | "groupTrips";

/** Which local inline SVG `ClientNavSidebar` renders (no icon library). */
export type ClientNavIconKind = "home" | "suitcase" | "sparkle" | "compass" | "users";

export interface ClientNavDestination {
  id: ClientNavDestinationId;
  label: string;
  /** Present ONLY for a built ("live") section; null for a "coming soon" signpost
   *  so it renders as a non-link (no dead ends — FR-003). */
  href: string | null;
  status: "live" | "soon";
  icon: ClientNavIconKind;
}

// Order is load-bearing (FR-001): Home, My Trips, Plan a trip, Discover, Group
// trips. Flipping a "soon" section to "live" is a one-line change here (add its
// href, set status "live") once its consumer route lands — the sidebar and the
// active-item marker both read this list, so no other file changes.
//
// "My Trips" is the ONLY entry whose label contains the substring "Trips"; the
// coming-soon "Group trips" is a NON-link, so Playwright's substring-based
// getByRole("link", { name: "Trips" }) can never resolve to two links (the same
// caution `lib/nav.ts` documents for the agent surface). The nav landmark is
// labelled "Traveler navigation" (see ClientNavSidebar), distinct from the agent
// "Main navigation", so cross-surface selectors never collide.
export const CLIENT_NAV_DESTINATIONS: readonly ClientNavDestination[] = [
  { id: "home", label: "Home", href: "/view", status: "live", icon: "home" },
  { id: "myTrips", label: "My Trips", href: "/view/my-trips", status: "live", icon: "suitcase" },
  { id: "plan", label: "Plan a trip", href: "/view/plan", status: "live", icon: "sparkle" },
  { id: "discover", label: "Discover", href: "/view/discover", status: "live", icon: "compass" },
  { id: "groupTrips", label: "Group trips", href: null, status: "soon", icon: "users" },
];
