// Single source of truth for the authenticated sidebar (spec 017 research
// D8, data-model "Nav Destination"). Pure data — DOM-free so it is L1
// testable — consumed by both AppSidebar (rendering) and every page's
// activeNav prop (WorkspacePageShell). `id` is exhaustive over
// WorkspacePageShell's activeNav union: adding/removing a destination here
// without updating that type is a compile error, not a runtime gap.
export type NavDestinationId =
  | "dashboard"
  | "builder"
  | "trips"
  | "marketplace"
  | "groupTravel"
  | "media"
  | "discover"
  | "tripHandoffs";

/** Which local icon `AppSidebar` renders for this destination (D8 — no icon library). */
export type NavIconKind = "grid" | "sparkle" | "suitcase" | "storefront" | "users" | "image" | "compass" | "inbox";

export interface NavDestination {
  id: NavDestinationId;
  label: string;
  href: string;
  icon: NavIconKind;
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: "grid" },
  { id: "builder", label: "AI Builder", href: "/workspace", icon: "sparkle" },
  { id: "trips", label: "Trips", href: "/trips", icon: "suitcase" },
  { id: "marketplace", label: "Marketplace", href: "/marketplace", icon: "storefront" },
  // "Group Travel", not "Group Trips": the label must not contain "Trips"
  // as a substring — Playwright's default accessible-name matching is
  // substring-based, and every existing e2e spec's `getByRole("link", {
  // name: "Trips" })` (no `exact: true`) would otherwise resolve to two
  // links (live-test regression: dashboard-shell/marketplace/workspace-list
  // journeys all broke on this before the rename).
  { id: "groupTravel", label: "Group Travel", href: "/group-travel", icon: "users" },
  { id: "media", label: "Media", href: "/media", icon: "image" },
  { id: "discover", label: "Discover", href: "/discover", icon: "compass" },
  // "Trip Requests", not "Trips": does not contain "Trips" as a substring
  // (matches the getByRole substring-matching caution documented above for
  // "Group Travel"/"Trips").
  { id: "tripHandoffs", label: "Trip Requests", href: "/trip-requests", icon: "inbox" },
];
