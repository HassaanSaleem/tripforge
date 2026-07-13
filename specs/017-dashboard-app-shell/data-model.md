# Data Model: Dashboard App Shell (spec 017)

No canonical itinerary schema change. No new database tables or columns. This
feature is entirely read-side projections over existing recorded data, plus
one purely-in-memory navigation map.

## Dashboard Stats (read-side projection)

Computed by `dashboardStats(db, agencyId)` (`packages/api/src/services/dashboard-stats.ts`),
served by `workspace.dashboard.stats` (agent-gated, tenant-scoped at the
query — INV-004).

| Field | Shape | Source | Notes |
|-------|-------|--------|-------|
| `gbvByCurrency` | `Array<{ currency: string; totalMinor: number }>` | `sum(booking_component.sell_minor)` grouped by currency, joined to `booking`/`itinerary` scoped to `agencyId` | Confirmed booking components only. Never summed across currencies (D5). Empty array for a fresh agency. |
| `earningsByCurrency` | `Array<{ currency: string; totalMinor: number }>` | `sum(revenue_share_ledger.seller_credit_minor)` grouped by currency, scoped to `sellerAgencyId` | Same query shape as `earningsAggregates` (packages/marketplace/src/earnings.ts), aggregated across all of the agency's listings rather than per-listing. |
| `activeTripCount` | `number` | `count()` over the agency's own `itineraries` rows | "Active" = exists and not fully booked-and-archived; v0 definition = all of the agency's itineraries (no archival state exists yet — documented as-is, not invented). |
| `listingCount` | `number` | `count()` over the agency's own `marketplace_listing` rows | Own listings only, any status the existing listings query already exposes. |
| `licenseCount` | `number` | `count()` over `marketplace_license` rows where the agency is the buyer | Licenses the agency holds (bought), distinct from `earningsByCurrency` (money the agency earned as a seller). |
| `recentActivity` | `Array<{ kind: "drafted" \| "booked" \| "licensed"; label: string; occurredAt: string }>` | Newest-`createdAt`-first over the agency's own `itineraries`/`booking`/`marketplace_license` rows, capped at a fixed count (e.g. 8) | Read-side synthesis only (D6) — no new stored entity, no pagination. `label` is a pre-formatted human string built server-side (e.g. "Trip drafted: Lisbon getaway"); the client renders it verbatim, no client-side string assembly of money/identifiers. |

**Validation rules**: every field is derived with `agencyId` as a query
predicate (never a post-fetch filter); every count/sum has a defined value
(0 / empty array) for an agency with no matching rows — no field may be
`null`/`undefined` for a valid agent session (spec FR-003, SC-003).

**State transitions**: none — this is a stateless read projection recomputed
on every request; nothing here is written to.

## Nav Destination (in-memory only)

`apps/web/lib/nav.ts` exports a single source of truth consumed by both
`AppSidebar` and every page's `activeNav` prop:

| Field | Shape | Notes |
|-------|-------|-------|
| `id` | `"dashboard" \| "builder" \| "trips" \| "marketplace" \| "media" \| "discover"` | Matches `WorkspacePageShell`'s widened `activeNav` union exactly — one type, no drift between the sidebar's rendering and each page's declared identity. |
| `label` | `string` | Human label shown in the sidebar ("Dashboard", "AI Builder", "Trips", "Marketplace", "Media", "Discover"). |
| `href` | `string` | Route path (`/dashboard`, `/workspace`, `/trips`, `/marketplace`, `/media`, `/discover`). |
| `icon` | inline SVG element/factory | D8 — no icon library; a tiny local map. |

**Validation rules**: exactly six destinations, one per FR-006; `id` values
are exhaustive over `WorkspacePageShell`'s `activeNav` prop type so a missing
case is a TypeScript error, not a runtime gap.

**State transitions**: none — a static list; "active" is derived per-render
from the current page's `activeNav` prop, not stored.
