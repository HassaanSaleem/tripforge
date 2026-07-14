# Phase 0 Research: Discover / "What's Hot" Feed

## Decision 1: Feed content is a static, in-repo curated data module — not a new tRPC router or DB table

**Decision**: Add `apps/web/lib/discover-feed.ts`, a hardcoded array of feed items keyed to the existing `HERO_DESTINATIONS` ids (`lisbon`/`tokyo`/`marrakech`/`reykjavik`), imported directly by the Discover page's client component. No new `packages/api` router, no new database table.

**Rationale**: The content is non-tenant-scoped (identical for every agent), not money-related, and small (≥3 items × 4 destinations). This mirrors the exact pattern `HERO_DESTINATIONS` already uses (`apps/web/lib/planner-form.ts`) for the same reason, stated explicitly in that file's own comment: "Deliberately hardcoded, not backend-fetched... this is a presentation-only feature." The Constitution's Development Workflow principle ("Simplicity default: prefer the simplest design that satisfies the spec") and the spec's own Assumptions ("curated/seeded content... not a live integration with an external events or listings API") both point the same direction. Architecture doc INV-025 names `whats_hot(destination, iso_week)` as the target Postgres-materialized shape for a *live, continuously-computed* version of this feed — that remains the correct destination for a future iteration once the feed is backed by a real signal (events API, personalization), but standing up a materialized-table + router for hand-authored seed content this cycle is premature engineering the constitution's simplicity default rejects.

**Alternatives considered**:
- New `discoverRouter` (packages/api) + Postgres-backed read, following the `dashboardRouter` pattern used by every other workspace sub-router. Rejected for this cycle: no per-tenant variation, no computation to cache, no write path — a network round trip to read a static array adds latency and surface area with no behavioral benefit. Revisit when the feed becomes live/personalized.
- Reusing `packages/supply-adapter/src/sandbox/curated-catalog.ts` directly (imported cross-package). Rejected: that module lives inside the supply-adapter boundary (booking/quoting concerns — net rates, currency, duration) and belongs to the separate `demo-01-seed` ticket, which is still `todo` and unverified (`salvage/demo-01-seed-partial` branch, unmerged). Depending on it would make Discover block on that ticket landing. Instead, Discover extracts only the presentational fields it needs (title, description, image URL, attribution) into its own small, self-contained module — same underlying vetted photo IDs, no cross-boundary or cross-ticket dependency.

## Decision 2: Reuse the vetted Unsplash CDN-URL + attribution convention from the unmerged salvage branch

**Decision**: Source each feed item's photo from the same `images.unsplash.com` / `plus.unsplash.com` direct CDN URL convention already vetted on `salvage/demo-01-seed-partial:packages/supply-adapter/src/sandbox/curated-catalog.ts` (real photo IDs + `"Photo by X on Unsplash"` attribution strings), rather than sourcing new imagery.

**Rationale**: Pre-Write Discipline favors reuse over new work. That branch's photo IDs are already real, licensed, attributed Unsplash photos matching hero-city places/activities — exactly the "trending places/experiences" content Discover needs. The convention (`images.unsplash.com`/`plus.unsplash.com` with query params, not the deprecated random `source.unsplash.com` endpoint) is the correct one per that module's own documented rationale, and matches `MediaSourceSchema`'s `"licensed-stock"` vocabulary (`packages/itinerary-schema/src/media.ts`).

**Alternatives considered**: Curating new photo IDs from scratch. Rejected — redundant work duplicating already-vetted content sourcing effort for the same 4 cities.

## Decision 3: Builder pre-seed via a `destination` query parameter, read server-side

**Decision**: A feed item's "Plan this" action links to `/workspace?destination=<value>`. `WorkspacePage` (`apps/web/app/(workspace)/workspace/page.tsx`) reads `searchParams.destination` and passes it as a new optional `initialDestination` prop to `<Planner>`, which seeds `PlannerFormValues.destination` in its initial state instead of the current hardcoded `""`.

**Rationale**: `Planner`'s destination field is already a plain trimmed string (`toTripRequest` in `apps/web/lib/planner-form.ts` just calls `.trim()`) — no server contract exists to change. The value passed matches the exact `"${city}, ${country}"` format the existing destination picker already writes via `selectDestination()`, so the seeded value behaves identically to a manually-picked destination. A URL query param keeps the handoff a plain, shareable, testable link — no hidden client-side state (sessionStorage, global store) that would complicate direct navigation or e2e testing.

**Alternatives considered**:
- `sessionStorage`/client-side handoff. Rejected — invisible in the URL, harder to test deterministically, breaks if Discover and the builder are opened in different tabs.
- A new tRPC mutation to "stage" a pending destination server-side. Rejected — unnecessary round trip and persisted state for a same-session UI value with no cross-device or cross-session requirement.

## Decision 4: New image-forward card styling, extending (not replacing) the existing `.tf-*` design-token vocabulary

**Decision**: Add Discover-specific CSS classes to `apps/web/app/globals.css` (e.g. `.tf-discover-card`, `.tf-discover-card-media`) built from the existing token scale (`--sea`, `--coral`, `--gold`, `--sand`, `--r`/`--r-lg`, `--shadow`) rather than a new gradient-only treatment like `.tf-dest-card`, since this is the first card in the repo to render a real photograph.

**Rationale**: No existing component renders an `<img>`/photo background — `ListingCard` and `GroupTripCard` are text+badge cards, and `.tf-dest-card` is deliberately gradient-only (no photo, per `planner-form.ts`'s own comment). The ticket's "editorial, magazine-grade" bar requires new visual treatment, but it must stay inside the established design system rather than introducing a competing style language.

**Alternatives considered**: A generic `<img>` with no dedicated card class, reusing `.tf-card` as-is. Rejected — `.tf-card` has no image-media slot and the "wow surface" bar (operator-set precedent: premium-ui-is-the-product) calls for a purpose-built treatment, consistent with how `.tf-market-card` was purpose-built for marketplace listings.

## Decision 5: Reuse the existing workspace access guard unchanged

**Decision**: Keep `apps/web/app/(workspace)/discover/page.tsx` as a server component wrapped in `WorkspacePageShell` + `getWorkspaceIdentity`, exactly as the current placeholder already does — only the body changes from the static "coming soon" card to the real feed UI.

**Rationale**: FR-006 requires the same verified-agent gate as every other workspace destination; that gate is already correctly wired on the placeholder page (per spec 017 research D7). No new access-control code is needed or desired.

**Alternatives considered**: None — this is the established, uncontested pattern for every workspace page (dashboard, trips, marketplace, media, group-travel, trip-requests).
