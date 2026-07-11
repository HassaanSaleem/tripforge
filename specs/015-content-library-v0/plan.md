# Implementation Plan: Content Library v0

**Branch**: `015-content-library-v0` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-content-library-v0/spec.md`

## Summary

Give agencies a tenant-scoped media library (register by URL + metadata, list,
get) behind a new `MediaStorePort` in the supply-adapter family, backed by a
new `media_asset` derived table (INV-025 — the itinerary document never holds
binaries, only references). Extend `workspace.itinerary` with attach/detach
mutations that read-modify-write the stored document's gallery/per-item
`media: MediaRef[]` arrays — a field the canonical schema has carried,
unused, since v0.1.0 (Constitution IV — no version bump). Deliberately widen
the client-view trust-boundary allowlist (spec 010 FR-007) to project
`alt`/`kind`/a servable URL for gallery + per-item media, never the internal
media-asset id or attribution. Render both surfaces to the existing premium
`.tf-*` kit: a workspace library panel and a `/view` gallery. Marketplace
listing-card imagery stays out of scope (gated on seed-0023).

## Technical Context

**Language/Version**: TypeScript 5.x (pnpm workspace, Next.js 15 app router + tRPC)

**Primary Dependencies**: `@tripforge/itinerary-schema` (MediaRefSchema, already v0.1.0), `@tripforge/supply-adapter` (new MediaStorePort + sandbox adapter), `@tripforge/db` (Drizzle ORM over Postgres), `@trpc/server`, existing `apps/web` client (`lib/trpc/client.ts`)

**Storage**: PostgreSQL — new `media_asset` table (tenant-scoped derived table, INV-025); no change to the `itinerary` table's shape, only its `document` JSONB payload gains populated `media` arrays it already schema-supports

**Testing**: vitest (L1/L2 unit — `packages/supply-adapter/src/__tests__`, `packages/itinerary-schema` round-trip), L3 integration against real Postgres (new `packages/api/src/__tests__/l3-media.test.ts` — cross-tenant refusal + attach/detach round-trip; extend `l3-client-view.test.ts` for the allowlist amendment), Playwright e2e, Live Test & Fix (INV-027)

**Target Platform**: Web (existing `apps/web` Next.js app), tRPC API surface

**Project Type**: Web application (monorepo: `packages/*` domain/adapters, `apps/web` UI)

**Performance Goals**: N/A beyond existing read-path expectations — a library list is a single tenant-scoped query; attach/detach is a single read-modify-write on one itinerary row, no fan-out

**Constraints**: Binaries never enter the itinerary document (INV-025) — v0 stores a caller-supplied URL + metadata only, no object-storage/upload pipeline; every new table/procedure is tenant-scoped (INV-004); the closed `MediaSource` enum is enforced at the registration boundary; canonical schema stays at v0.1.0 (Constitution IV, no migration); the client-view allowlist amendment is deliberate and reviewed (DIRECTIVE item 3), not silent; marketplace listing cards are untouched (out of scope, gated on seed-0023)

**Scale/Scope**: One new port + sandbox adapter, one new table, one new router (`workspace.media`) + two new mutations on the existing `workspace.itinerary` router, one client-view allowlist extension, two UI surfaces (workspace library panel, `/view` gallery)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Marketplace-First**: PASS. Sell-grade, picture-led client proposals directly serve Principle II's client-facing polish requirement, which in turn earns the right to build the network (Constitution I depends on II). Marketplace listing-card imagery — the more direct marketplace-liquidity lever — is explicitly deferred to seed-0023, not because it doesn't matter but because its money/rights semantics are undecided; this spec does not block that follow-up.
- **II. Agent Experience Is the Wedge**: PASS. Directly closes the PRD Pillar-1 gap ("attach content from the media library") against the operator's premium sell-grade bar. White-label presentation is preserved: client-view media renders under the agency's own brand, per the existing `data-plain` opt-out, with zero platform branding.
- **III. Budget-Aware AI**: N/A — no planning/budget surface touched. (Note: Compliance & Content Sourcing's imagery rule — never present AI-generated visuals as real place photos — is enforced structurally by the closed `MediaSource` enum, which has no AI-fabricated member; this feature does not add one.)
- **IV. Canonical Itinerary Schema**: PASS. `MediaRefSchema` and the `media: MediaRef[]` arrays on `Itinerary`/`Item` already exist at `SCHEMA_VERSION = "0.1.0"`. No field added, no version bump, no migration note required — this feature is the first to populate a dormant-complete part of the existing schema.
- **V. Integrate Supply, Don't Contract It**: PASS by extension of intent. `MediaStorePort` is not a bookable-component supplier port (no search/quote/book/cancel lifecycle applies to library metadata) — it is a new, narrower port in the same adapter-boundary family, so no storage/registration shape leaks outside `packages/supply-adapter` (see Complexity Tracking for the shape deviation rationale).
- **VI. Trust, Provenance & Revenue-Share Integrity**: N/A — no money path touched. The trust-boundary allowlist widening (client-view FR-007) is the closest touchpoint to this principle's spirit (mechanical enforcement, not policy): the amendment adds fields to an allowlist, it does not relax tenant scoping or provenance guarantees, and it goes through the speckit flow (this plan) per DIRECTIVE item 3.

**Result: PASS. One noted shape deviation (Principle V) justified below; no blocking violations.**

## Project Structure

### Documentation (this feature)

```text
specs/015-content-library-v0/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── media-library.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/supply-adapter/src/ports/media-store.ts          # NEW: MediaStorePort + MediaAsset/outcome types
packages/supply-adapter/src/sandbox/media-store.ts         # NEW: SandboxMediaStoreAdapter (Postgres-backed, tenant-scoped)
packages/supply-adapter/src/__tests__/media-store.test.ts  # NEW: L1/L2 adapter tests
packages/supply-adapter/src/index.ts                       # +export MediaStorePort types + SandboxMediaStoreAdapter

packages/db/src/schema.ts                                  # NEW table: mediaAsset (agencyFk, source, kind, url, alt, attribution, createdAt)
packages/db/src/index.ts                                   # +export mediaAsset

packages/api/src/context.ts                                # Container: +mediaStore: MediaStorePort
packages/api/src/container.ts                               # buildContainer: +mediaStore: new SandboxMediaStoreAdapter()
packages/api/src/services/media.ts                          # NEW: registerMedia / listMedia / getMedia (tenant-scoped)
packages/api/src/services/itineraries.ts                    # +attachMedia / detachMedia (read-modify-write document.media / item.media)
packages/api/src/services/client-view.ts                    # ClientViewItem/ClientItineraryView: +media (allowlist amendment, FR-007)
packages/api/src/routers/workspace-media.ts                 # NEW: workspace.media router (register/list/get)
packages/api/src/routers/itinerary.ts                       # +attachMedia/detachMedia mutations
packages/api/src/routers/workspace.ts                       # +media: workspaceMediaRouter
packages/api/src/__tests__/l3-media.test.ts                 # NEW: cross-tenant refusal, attach/detach round-trip, closed-enum refusal
packages/api/src/__tests__/l3-client-view.test.ts            # +media allowlist assertions (no internal id leak)

apps/web/lib/media-library.ts                                # NEW: pure formatting/validation helpers (mirrors itinerary-list.ts pattern)
apps/web/lib/trpc/client.ts                                  # type re-exports if needed
apps/web/app/(workspace)/workspace/media-library-panel.tsx   # NEW: library list + register form
apps/web/app/(workspace)/workspace/itinerary-days.tsx         # +attach/detach controls per item + gallery
apps/web/app/(workspace)/workspace/workspace-panels.tsx       # wire media-library-panel into the existing panel composition
apps/web/app/(client-view)/view/[token]/page.tsx              # +gallery + per-item media rendering
apps/web/app/globals.css                                     # +.tf-media-* classes for the library panel + gallery, matching the existing kit

scenarios/incubating/content-library-media-gap/scenario.mjs   # flip gap checks to affordance checks (spec AC), keep trust-boundary checks
```

**Structure Decision**: Follows the established supply-adapter-family pattern
(new port + sandbox adapter, DI through `Container`), the established
service/router split (`services/*.ts` pure logic, `routers/*.ts` thin tRPC
wiring), and the established UI pattern (`lib/*.ts` pure helpers +
`.tf-*`-styled client components). No new package — `MediaStorePort` lives
in the existing `packages/supply-adapter` package per the ticket's explicit
placement, since that package is already the adapter-boundary home and this
keeps "no storage shapes outside the adapter boundary" enforceable in one
place.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| `MediaStorePort` does not follow the `SupplyPort<Criteria, Offer, Quote>` search/quote/book/cancel shape (Principle V's established pattern) | Media-asset storage is a metadata repository, not a quote-then-book supplier lifecycle — there is no offer, no price hold, no booking to cancel | Forcing media storage through `search`/`quote`/`book`/`cancel` verbs would be a worse fit than a small dedicated `register`/`list`/`get` interface; the principle's *intent* (no supplier/storage shape outside the adapter boundary, swappable implementation) is preserved by keeping `MediaStorePort` in the same package behind the same `Container`-injected DI pattern, only the verb set differs |
