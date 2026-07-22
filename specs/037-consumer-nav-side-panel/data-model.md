# Phase 1 Data Model: Consumer-surface navigation side panel

This feature adds **no persisted data** and **no canonical-itinerary-schema
change**. The only new "model" is a UI-layer data structure describing the
consumer navigation. It is DOM-free and L1-testable, mirroring `apps/web/lib/nav.ts`.

## Entity: Consumer Nav Destination (`apps/web/lib/client-nav.ts`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `ClientNavDestinationId` (string union) | Stable key; exhaustive over the shell's `activeNav` union (adding/removing a destination without updating the type is a compile error, not a runtime gap — same discipline as `NavDestinationId`). |
| `label` | `string` | Visible nav text. "My Trips" is the only entry containing the substring "Trips"; coming-soon entries are non-links, so no Playwright `getByRole` substring collision (research R4). |
| `href` | `string \| null` | Present ONLY for `status: "live"` destinations; `null` for `status: "soon"` (renders as a non-link signpost — no dead ends, FR-003). |
| `status` | `"live" \| "soon"` | `live` → navigable link; `soon` → coming-soon signpost. Flipping a section from `soon` to `live` (adding its `href`) is the single-source-of-truth one-line change when its route lands. |
| `icon` | `ClientNavIconKind` (string union) | Which local inline SVG the sidebar renders (no icon library). |

### Invariants (enforced by `lib/__tests__/client-nav.test.ts`)

- **INV-A**: Every `status: "live"` destination has a non-null `href`; every
  `status: "soon"` destination has `href === null`. (Guarantees FR-003: no
  coming-soon dead link, no live section without a target.)
- **INV-B**: `id` values are unique and the set exactly matches the shell's
  `ClientNavDestinationId` union (compile-time exhaustiveness + a runtime uniqueness
  assertion).
- **INV-C**: The destination order is exactly Home, My Trips, Plan a trip,
  Discover / What's Hot, Group trips (FR-001 ordering; Account/sign-out is a fixed
  shell region, not a nav destination).
- **INV-D**: No `label` contains the strings "TripForge" or "Trellis" (FR-004
  belt-and-suspenders at the data layer).

### Initial data

| id | label | href | status | icon |
|----|-------|------|--------|------|
| `home` | Home | `/view` | live | `home` |
| `myTrips` | My Trips | `/view/my-trips` | live | `suitcase` |
| `plan` | Plan a trip | `null` | soon | `sparkle` |
| `discover` | Discover | `null` | soon | `compass` |
| `groupTrips` | Group trips | `null` | soon | `users` |

("Discover" label kept short; the `What's Hot` framing lives in the visible
description/coming-soon copy, not the substring-sensitive nav label.)

## Not modeled here

- No DB table, no Drizzle schema, no migration.
- No tRPC procedure / contract (see `contracts/README.md`).
- No change to `packages/itinerary-schema` (Principle IV): the consumer nav is
  chrome, not itinerary data.
