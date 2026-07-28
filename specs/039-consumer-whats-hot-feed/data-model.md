# Data Model: Consumer "What's Hot" Discovery Feed

**Feature**: 039-consumer-whats-hot-feed | **Date**: 2026-07-27

## Entities

This feature introduces **no new entity** and **no schema change**. It reads one existing, static, in-repo type and threads one existing cross-page interface.

### DiscoverFeedItem (existing — reused unchanged)

Defined in `apps/web/lib/discover-feed.ts`. Non-tenant, non-money, curated content.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Stable `${destinationId}-${activitySlug}` key. |
| `destinationId` | `HeroDestination["id"]` | One of `lisbon` \| `tokyo` \| `marrakech` \| `reykjavik`. |
| `title` | `string` | Card heading (the "what's hot" experience). |
| `blurb` | `string` | Short "what's happening" copy. |
| `image` | `{ url; alt; attribution; source: "licensed-stock" }` | Licensed Unsplash CDN image; `source` matches `MediaSourceSchema` vocabulary. |
| `hotelHighlight` | `{ name; description }` | The highlighted stay for the card. |
| `planDestination` | `string` | Exact `"${city}, ${country}"` string seeded into the planner via `?destination=`. |

**Invariant preserved**: ≥3 items per destination (`WHATS_HOT_FEED` builds ≥3 per `HERO_DESTINATIONS` entry; FR-003 / SC-004). All imagery `source: "licensed-stock"` with `attribution` present (FR-009 / SC-004).

## Cross-page interface (existing pattern, new consumer target)

### `?destination=` seed param

- **Producer**: each feed card's "Plan this" link → `${planPath}?destination=${encodeURIComponent(item.planDestination)}`.
  - Workspace surface: `planPath = "/workspace"` (unchanged behavior).
  - Consumer surface: `planPath = "/view/plan"` (new).
- **Consumer consumer**: `apps/web/app/(client-view)/view/plan/page.tsx` reads `searchParams.destination` (string; array/empty ignored) → `initialDestination` prop → `ConsumerPlanner` pre-fills the chat composer with `Plan a trip to ${initialDestination}`.
- **Contract**: [contracts/discover-to-consumer-planner-handoff.md](./contracts/discover-to-consumer-planner-handoff.md).

## Component props (new/generalized)

### `DiscoverFeedCard` (extracted, generalized)

| Prop | Type | Notes |
|------|------|-------|
| `item` | `DiscoverFeedItem` | Unchanged from the workspace card. |
| `planPath` | `string` | NEW — base path for the "Plan this" link (`/workspace` or `/view/plan`). |

### `DiscoverFeedView` (extracted, generalized)

| Prop | Type | Notes |
|------|------|-------|
| `planPath` | `string` | NEW — threaded to each `DiscoverFeedCard`. |

### `ConsumerPlanner` (extended)

| Prop | Type | Notes |
|------|------|-------|
| `contactName` | `string \| null` | Unchanged. |
| `contactEmail` | `string \| null` | Unchanged. |
| `initialDestination` | `string \| undefined` | NEW (optional) — seeds the first chat message; absent → today's behavior. |

## State & persistence

None new. The feed is a static import; the seed is client-side composer state. No database, no tRPC procedure, no migration. No money path, no revenue-share, no canonical-itinerary-schema surface touched (FR-013).
