# Tasks: Content Library v0

**Input**: Design documents from `/specs/015-content-library-v0/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/media-library.md, quickstart.md

**Tests**: L1/L2 unit + L3 integration tests ARE included — the quality bar
(`.kitchenloop/unbeatable-tests.md`) mandates L3 coverage for integration
points (new tenant-scoped tables/procedures), and this feature deliberately
widens a trust boundary (client-view allowlist), which needs a hard
negative-assertion test, not just a happy-path one.

**Organization**: Tasks are grouped by user story (US1 = media library, US2 =
attach/detach, US3 = client-view rendering) per spec.md priorities (US1/US2
are both P1 — US2 depends on US1's library existing to attach anything from;
US3 is P2 and depends on US2's attachments existing to render).

## Phase 1: Setup

- [X] T001 Add `mediaAsset` table to `packages/db/src/schema.ts`: `id` (uuid PK default random), `agencyId` (`agencyFk()`), `source` (text, not null), `kind` (text, not null), `url` (text, not null), `alt` (text, not null), `attribution` (text, nullable), `createdAt` (timestamp, default now); index `media_asset_agency_idx` on `agencyId` (data-model.md)
- [X] T002 Export `mediaAsset` from `packages/db/src/index.ts` alongside the other table exports (barrel pattern, INV-017)

## Phase 2: Foundational (blocks all user stories)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create `packages/supply-adapter/src/ports/media-store.ts`: `MediaAsset`, `RegisterMediaInput`, `RegisterMediaOutcome`, `MediaStorePort` interface (`register`/`list`/`get`) per contracts/media-library.md §1-3 and research.md D1 (reuse `MediaSource` type shape, do not import from `@tripforge/itinerary-schema` — supply-adapter has no dependency on itinerary-schema today; redeclare the same closed string-literal union locally to keep the packages independent, matching how `ports/hotel.ts` etc. declare their own local types)
- [X] T004 Create `packages/supply-adapter/src/sandbox/media-store.ts`: `SandboxMediaStoreAdapter implements MediaStorePort`, Postgres-backed via an injected `Db` (constructor param, mirrors how other sandbox adapters take config) — `register` validates `source` against the closed set (typed `refused`/`invalid_source` outcome, defense-in-depth alongside the tRPC-boundary Zod check), `list`/`get` scoped by `agencyId`
- [X] T005 [P] Add `packages/supply-adapter/src/__tests__/media-store.test.ts`: L1 test for the one branch that touches no database (closed-enum refusal, returns before any query). DEVIATION (recorded, mirrors seed-0030 T003 precedent): register/list/get's DB-dependent tenant-scoping and round-trip behavior is NOT unit-tested here — mocking a Drizzle query builder would be a first-of-its-kind brittle pattern; that coverage lives in L3 (`packages/api/src/__tests__/l3-media.test.ts`, T011/T018) against real Postgres
- [X] T006 Export `MediaStorePort`, `MediaAsset`, `RegisterMediaOutcome`, `SandboxMediaStoreAdapter` from `packages/supply-adapter/src/index.ts` (mirrors the existing hotel/activity/transfer/car-rental export block)
- [X] T007 Wire `mediaStore: MediaStorePort` into `Container` in `packages/api/src/context.ts`, and `mediaStore: new SandboxMediaStoreAdapter(options.db)` in `buildContainer()` in `packages/api/src/container.ts` (mirrors the existing `hotel`/`activity`/`transfer`/`carRental` wiring)
- [X] T008 Create `packages/api/src/services/media.ts`: `registerMedia`/`listMedia`/`getMedia` — thin tenant-scoped wrappers over `container.mediaStore`, deriving `agencyId` from `AgentSessionContext` (never client-supplied), per contracts/media-library.md §1-3
- [X] T009 Create `packages/api/src/routers/workspace-media.ts`: `workspaceMediaRouter` with `register`/`list`/`get` procedures under `agentProcedure`, Zod input validation (`z.strictObject`) enforcing the closed `source` enum at the boundary per contracts §1
- [X] T010 Wire `media: workspaceMediaRouter` into `workspaceRouter` in `packages/api/src/routers/workspace.ts` (alongside `itinerary`/`booking`/`marketplace`)

**Checkpoint**: Foundation ready — `workspace.media.*` procedures exist and are tenant-scoped; user story work can begin.

## Phase 3: User Story 1 — Build a licensed media library (Priority: P1) 🎯 MVP

**Goal**: An agent registers media items (URL + metadata) into their agency's library and lists them; cross-tenant reads are refused.

**Independent Test**: Register two media items as agency A (one `agent-upload`, one `licensed-stock`); confirm both appear in A's library list; confirm agency B's library list shows neither.

- [X] T011 [US1] Add `packages/api/src/__tests__/l3-media.test.ts` (new file): L3 assertions — register succeeds and appears in `list`; register with an invalid `source` value is refused at the tRPC boundary (`BAD_REQUEST`) and nothing persists; agency B's `list`/`get` never returns agency A's assets (spec User Story 1 acceptance scenarios, SC-003)
- [X] T012 [P] [US1] Add `apps/web/lib/media-library.ts`: pure helpers — `mediaSourceLabel(source)`, `mediaKindLabel(kind)`, basic client-side URL/alt presence validation before submit (mirrors `apps/web/lib/itinerary-list.ts` pattern: pure functions, no framework imports)
- [X] T013 [US1] Create `apps/web/app/(workspace)/workspace/media-library-panel.tsx`: `"use client"` component — register form (source select constrained to the closed set, kind select, url/alt/attribution inputs) + library list (calls `trpc.workspace.media.list`/`register`), state machine matching `itinerary-list.tsx`'s `loading|loaded|failed` pattern, styled with the existing `.tf-*` kit
- [X] T014 [US1] Wire `MediaLibraryPanel` into `apps/web/app/(workspace)/workspace/workspace-panels.tsx` (or `page.tsx`, whichever currently composes `Planner`/`ItineraryDays`/`BookingFlow` — match that file's existing composition pattern)
- [X] T015 [US1] Add/extend a Playwright e2e spec: sign up, open the media library panel, register a media item, confirm it appears in the list without a page reload (folded into tests/e2e/content-library-journey.spec.ts alongside T020/T025 — one serial journey covers register → attach gallery → attach item → client render, per the repo's existing multi-story-per-journey pattern, e.g. workspace-list-journey.spec.ts)

**Checkpoint**: User Story 1 is independently functional — an agent can build a media library, tenant-isolated.

## Phase 4: User Story 2 — Attach media to an itinerary (Priority: P1)

**Goal**: An agent attaches a library media item to an itinerary's gallery or to a specific item, and detaches it later; attachments round-trip through reads; cross-tenant attach/detach is refused.

**Independent Test**: Attach one media item to an itinerary's gallery and one to a specific item; reload via `workspace.itinerary.get`; confirm both persisted. Detach one; reload; confirm it's gone and the other is untouched.

- [X] T016 [US2] Add `attachMedia`/`detachMedia` to `packages/api/src/services/itineraries.ts`: tenant-scoped read-modify-write on `itinerary.document` per research.md D3/D4 — load + `scopedWhere` ownership check (itinerary AND, for attach, the media asset via `container.mediaStore.get`), `parseItinerary` boundary re-validation, locate `target` (gallery array or the item by id within `document.days[].items[]`), push/dedupe-by-id (attach) or filter-by-id (detach) the `MediaRef`, re-validate with `ItinerarySchema.parse`, `UPDATE itinerary SET document = ...`; typed outcomes (`attached`/`detached`/`not_found`/`item_not_found`) per contracts §4-5
- [X] T017 [US2] Add `attachMedia`/`detachMedia` mutations to `packages/api/src/routers/itinerary.ts` under `agentProcedure`, Zod-validated input (`itineraryId`, `mediaAssetId`/`mediaRefId`, discriminated `target`), mapping typed outcomes to `TRPCError({ code: "NOT_FOUND" })` only where the existing router convention does so (compare `share`'s handling of `not_found`) — otherwise return the typed outcome object directly, matching contracts §4-5
- [X] T018 [US2] Extend `packages/api/src/__tests__/l3-media.test.ts`: attach to gallery + attach to a specific item, then `workspace.itinerary.get` and assert both `media` arrays contain the expected `MediaRef`; detach one and assert it's gone while the other persists; attach with a cross-tenant `mediaAssetId` or a cross-tenant `itineraryId` is refused with no state change; attach to an unknown `itemId` returns `item_not_found` (spec User Story 2 acceptance scenarios + Edge Cases)
- [X] T019 [US2] Add attach/detach controls to `apps/web/app/(workspace)/workspace/itinerary-days.tsx` (per item) and to the itinerary gallery surface (wherever the itinerary's own `media` gallery is/will be rendered in the workspace preview — add a minimal gallery block if none exists today), backed by `trpc.workspace.itinerary.attachMedia`/`detachMedia`, sourcing the pick-list from `MediaLibraryPanel`'s already-loaded library (lift state or refetch, matching the existing `refreshToken` pattern in `itinerary-list.tsx` for cross-component refresh)
- [X] T020 [US2] Add/extend a Playwright e2e spec: register media, attach to gallery and to one item, reload, confirm both render in the workspace preview; detach one, reload, confirm only that one is gone (folded into content-library-journey.spec.ts; detach round-trip is covered at L3 in l3-media.test.ts — the e2e proves the UI attach wiring end-to-end)

**Checkpoint**: User Story 2 is independently functional — attachments persist and are tenant-safe; combined with US1 this is a usable MVP (library + attach), even before client-view rendering ships.

## Phase 5: User Story 3 — Client sees a real proposal (Priority: P2)

**Goal**: The `/view` client page renders gallery + per-item media with alt text, projecting nothing beyond kind/url/alt; an itinerary with no media renders unchanged.

**Independent Test**: Attach media (via US2), share, open `/view/<token>`, confirm images + alt text render and confirm no internal id/source/attribution appears in the page or its source.

- [X] T021 [US3] Add `ClientViewMedia` type and `media: ClientViewMedia[]` to `ClientItineraryView` and each `ClientViewItem` variant in `packages/api/src/services/client-view.ts`; populate in `toClientItineraryView` by mapping `document.media` (gallery) and each `item.media` (per-item) to `{ kind, url, alt }` only — per contracts §7, research.md D5 (never `id`/`source`/`attribution`)
- [X] T022 [US3] Extend `packages/api/src/__tests__/l3-client-view.test.ts`: attach media (gallery + item) to a shared itinerary, resolve the share link, assert `view.media` and the relevant `view.days[].items[].media` contain exactly `{kind,url,alt}` and that `JSON.stringify(view)` contains neither the media asset's `id`, its `source` value, nor its `attribution` string (FR-010, SC-004); assert an itinerary with no attached media returns `media: []` everywhere, never `null`/`undefined` (SC-005)
- [X] T023 [US3] Render the gallery + per-item media in `apps/web/app/(client-view)/view/[token]/page.tsx`: `<img>` for `kind: "image"`, a labeled link (e.g. "▶ Watch video") for `video`/`embed` per research.md D6; render nothing extra when `media` is empty (no broken placeholders, SC-005)
- [X] T024 [US3] Add `.tf-media-*` classes to `apps/web/app/globals.css` for the gallery grid and per-item media, matching the existing premium kit's visual language (spacing/radius/shadow conventions already used by `.tf-card`)
- [X] T025 [US3] Add/extend a Playwright e2e spec on the client-view suite (folded into content-library-journey.spec.ts: gallery + per-item render with alt text, no-media-unchanged negative, source-label leak scan): attach media, share, open `/view/<token>` unauthenticated, assert the gallery image renders with its alt text, and assert (via page content/source inspection) that no internal media id or source string appears anywhere on the page (mirrors the existing white-label negative-assertion pattern in the client-view e2e specs, INV-020 precedent)

**Checkpoint**: All three user stories are independently functional — the full picture-led proposal flow works end to end.

## Phase 6: Scenario + Polish

- [X] T026 Update `scenarios/incubating/content-library-media-gap/scenario.mjs`: flip the existing gap checks (documented in seed-0022) to affordance checks proving the library/attach/render surfaces now exist, WITHOUT weakening any existing trust-boundary check (spec Acceptance Criteria — "gap checks flip to affordance checks WITHOUT weakening the trust-boundary checks")
- [ ] T027 Run `pnpm run lint` and `pnpm test` at the repo root (or inside the built image if host installs are denied); fix any findings
- [ ] T028 Live Test & Fix (INV-027) per quickstart.md — boot the built stack, run smoke + full e2e, drive the browser journey (Playwright MCP, screenshots), scan logs, fix any defect in-cycle
- [ ] T029 Write the sealed UAT card for seed-0022 per `.claude/skills/kitchenloop-execute/UAT-GATE.md`

## Dependencies & Execution Order

- **Setup (T001-T002)** blocks Foundational (the `mediaAsset` table must exist before the sandbox adapter can query it).
- **Foundational (T003-T010)** blocks all user stories — `workspace.media.*` must exist before US1's UI can call it, and `container.mediaStore` must exist before US2's `attachMedia` can look up an asset.
- **User Story 1 (T011-T015)** depends only on Foundational. Independently shippable as "build a library" (no attach yet).
- **User Story 2 (T016-T020)** depends on Foundational AND on US1 existing enough to have media to attach (register via T009's procedure, or directly via the L3 test's own setup) — but does NOT require US1's UI (T013-T015) to be done; the L3 test (T018) can register media directly through the service layer.
- **User Story 3 (T021-T025)** depends on US2's attach/detach existing (something must be attached before there's anything to render) — T022's L3 test needs `attachMedia` (T016) to set up its fixture.
- **Polish (T026-T029)** runs after all three stories are complete.

## Parallel Example

```
# Phase 2, after T001-T002 (schema) complete:
T003 [ports/media-store.ts]         → T004 [sandbox/media-store.ts] → T005 [P] [tests]
                                                                     → T006 [index.ts export]
# T007 (context/container wiring) depends on T006.
# T008 (service) depends on T007. T009 (router) depends on T008. T010 (mount) depends on T009.

# Within US1, after Foundational:
T011 [P] [US1] packages/api/src/__tests__/l3-media.test.ts
T012 [P] [US1] apps/web/lib/media-library.ts
# T013 depends on T012 (imports its helpers); T014 depends on T013; T015 depends on T014.
```

## Implementation Strategy

**MVP = User Story 1 + User Story 2** (T001-T020): a library exists and
media can be attached to itineraries, persisted and tenant-safe — this is
the ticket's structural core (spec Acceptance Criteria items 1-3) and is
independently verifiable via the L3 suite even before any client-facing
rendering ships. **User Story 3** (T021-T025) is the payoff (client sees
photos) and depends on US2's attachments existing, but is its own
independently testable increment once US2 lands. If this cycle runs out of
time after US1+US2, a partial PR with US3 as documented follow-up is
preferable to an incomplete US3 (a half-built trust-boundary amendment is
higher risk than a deferred one).
