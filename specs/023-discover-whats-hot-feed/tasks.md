# Tasks: Discover / "What's Hot" Feed

**Input**: Design documents from `/specs/023-discover-whats-hot-feed/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/discover-to-builder-handoff.md, quickstart.md

**Tests**: Included — L1 data-shape tests over the static feed module and an e2e journey spec, matching this repo's `.kitchenloop/unbeatable-tests.md` bar for user-visible behavior changes.

**Organization**: Grouped by user story (spec.md) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

**Purpose**: Baseline check — no new dependencies or config are needed for this feature.

- [X] T001 Confirm `pnpm run lint` and `pnpm test` are green on the current branch before starting (baseline; no new dependencies to install per plan.md Technical Context) — host pnpm denied in this loop session; will verify via the in-image Docker recipe at the Lint+Tests step

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The curated data module and card styling every user story renders/reads.

**⚠️ CRITICAL**: US1–US3 all read from the data module created here; none can start until it exists.

- [X] T002 [P] Create the `DiscoverFeedItem` type and `WHATS_HOT_FEED` curated array in `apps/web/lib/discover-feed.ts` — ≥3 items per `HERO_DESTINATIONS` entry (lisbon/tokyo/marrakech/reykjavik), reusing the vetted `images.unsplash.com`/`plus.unsplash.com` photo IDs + `"Photo by X on Unsplash"` attributions from `salvage/demo-01-seed-partial:packages/supply-adapter/src/sandbox/curated-catalog.ts` (research.md Decision 2), each item shaped per data-model.md (`id`, `destinationId`, `title`, `blurb`, `image: {url, alt, attribution, source: "licensed-stock"}`, `hotelHighlight: {name, description}`, `planDestination` exactly `"${city}, ${country}"`)
- [X] T003 [P] Add `.tf-discover-card` / `.tf-discover-card-media` (and any supporting) classes to `apps/web/app/globals.css`, built from the existing `--sea`/`--coral`/`--gold`/`--sand`/`--r`/`--r-lg`/`--shadow` tokens (research.md Decision 4) — an image-forward card treatment distinct from the gradient-only `.tf-dest-card`
- [X] T004 [P] Write `apps/web/lib/__tests__/discover-feed.test.ts` asserting the data-model.md validation rules: every `HERO_DESTINATIONS` id has ≥3 items (SC-004), every item's `title`/`blurb`/`image.url`/`image.alt`/`image.attribution`/`hotelHighlight.name`/`hotelHighlight.description`/`planDestination` is non-empty, `id` is unique across the set, `image.source` is always `"licensed-stock"`, and `planDestination` exactly equals `"${city}, ${country}"` for its `destinationId`

**Checkpoint**: Data module + design tokens exist and are unit-tested — user story implementation can begin.

---

## Phase 3: User Story 1 - Browse what's hot for a destination (Priority: P1) 🎯 MVP

**Goal**: Discover replaces its "coming soon" placeholder with a real, populated, image-forward feed per destination.

**Independent Test**: Sign in as a verified agent, open Discover, pick a featured destination, confirm ≥3 populated cards render (photo + blurb + hotel highlight); switch destination and confirm the feed's contents fully replace.

### Implementation for User Story 1

- [X] T005 [US1] Create `FeedItemCard` in `apps/web/app/(workspace)/discover/feed-item-card.tsx` — renders one `DiscoverFeedItem`'s photo (with `alt`), blurb, hotel highlight, and a "Plan this" action; an image load failure MUST NOT hide the blurb/hotel-highlight/Plan-this content (spec Edge Cases)
- [X] T006 [US1] Create `DiscoverFeedView` (`"use client"`) in `apps/web/app/(workspace)/discover/discover-feed-view.tsx` — a destination picker reusing `HERO_DESTINATIONS` from `apps/web/lib/planner-form.ts`, and a feed grid rendering `FeedItemCard` for every `WHATS_HOT_FEED` item matching the selected `destinationId` (FR-009: switching destinations replaces the rendered set, no stale carry-over)
- [X] T007 [US1] Replace the placeholder body in `apps/web/app/(workspace)/discover/page.tsx` with `<DiscoverFeedView />`; keep the existing `WorkspacePageShell` + `getWorkspaceIdentity` guard, `activeNav="discover"` prop, and `dynamic = "force-dynamic"` export exactly as they are today (FR-006 — no new or weakened access path)
- [X] T008 [US1] Create `tests/e2e/discover-journey.spec.ts` covering the browse flow: sign in → nav to Discover (verify the "Discover" label doesn't substring-collide with another nav link, per this repo's `getByRole` nav-matching caution) → pick a destination → assert ≥3 populated cards render → switch to a second destination → assert the feed's items fully changed (no item from the first destination remains) — ALSO fixed a latent regression in `tests/e2e/dashboard-shell-journey.spec.ts`, which asserted the old "coming soon" placeholder still existed

**Checkpoint**: User Story 1 is independently functional and testable — Discover shows a real feed.

---

## Phase 4: User Story 2 - Turn inspiration into a plan (Priority: P1)

**Goal**: A feed item's "Plan this" action opens the AI builder with that item's destination already filled in.

**Independent Test**: From a populated Discover feed, tap "Plan this" on any item; confirm the builder's destination field is pre-filled with that item's destination and every other field still shows its normal default.

### Implementation for User Story 2

- [X] T009 [US2] Add an optional `initialDestination?: string` prop to `Planner` in `apps/web/app/(workspace)/workspace/planner.tsx`; seed `useState<PlannerFormValues>` with `initialDestination` in place of the hardcoded `""` default when provided, touching no other `INITIAL_VALUES` field (contracts/discover-to-builder-handoff.md)
- [X] T010 [US2] In `apps/web/app/(workspace)/workspace/page.tsx`, read the `destination` search param (Next.js `searchParams` prop on the server component) and pass it as `initialDestination` to `<Planner>`; when absent/empty, behavior MUST be byte-identical to today (contracts/discover-to-builder-handoff.md Backward compatibility)
- [X] T011 [US2] Wire each `FeedItemCard`'s "Plan this" action (`apps/web/app/(workspace)/discover/feed-item-card.tsx`, from T005) to navigate to `/workspace?destination=${encodeURIComponent(item.planDestination)}` — done inline as part of T005
- [X] T012 [US2] Extend `tests/e2e/discover-journey.spec.ts` (T008) with the handoff assertion: tap "Plan this" on a card → assert `/workspace` loads with the Destination input already containing that item's `planDestination` → assert the dates/party-size/budget/currency fields still show their normal defaults (no unintended cross-field effect)

**Checkpoint**: User Stories 1 and 2 both work independently — the full browse → plan loop is live.

---

## Phase 5: User Story 3 - Trustworthy, attributed imagery (Priority: P2)

**Goal**: Every feed image is a real, licensed, attributed photograph — never a placeholder, scraped image, or AI-generated photo presented as real.

**Independent Test**: Inspect each feed item's image/attribution data and confirm every image is licensed-stock with attribution present.

### Implementation for User Story 3

- [X] T013 [P] [US3] Extend `apps/web/lib/__tests__/discover-feed.test.ts` (T004) with an assertion block: every `WHATS_HOT_FEED` item's `image.url` host is `images.unsplash.com` or `plus.unsplash.com`, `image.attribution` matches a non-empty `"Photo by … on Unsplash"`-shaped string, and `image.source` is exactly `"licensed-stock"` (SC-003, FR-007) — done inline as part of T004 (this repo has no component-unit-test harness, only e2e — see T014)
- [X] T014 [US3] Add a broken-image-resilience check to `FeedItemCard` (T005) or a dedicated component test: simulate an image `onError` and assert the blurb, hotel highlight, and "Plan this" action remain visible/usable (spec Edge Cases) — implemented as an e2e test in `tests/e2e/discover-journey.spec.ts` (no RTL/jsdom harness exists in this repo for component-level tests)

**Checkpoint**: All three user stories are independently functional — Discover is feature-complete for this cycle.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 Run `pnpm run lint` and fix any findings across all new/modified files — clean, no findings; fixed one `noUncheckedIndexedAccess` type error in discover-feed.ts during the build check
- [X] T016 Run `quickstart.md`'s automated validation (`pnpm test`) — 440/440 passed (0 failed), including the new `discover-feed.test.ts` (6/6); e2e + manual walkthrough covered under T017 below
- [X] T017 Live Test & Fix (INV-027): boot the built compose stack, run the smoke oracle plus the FULL `npx playwright test` suite (not just the new spec — protects against nav-label substring collisions and stale shared e2e helpers per this repo's established regression patterns), drive the Discover → Plan-this journey in a real browser with screenshots, scan compose logs, fix any defect found — L3 smoke 46/46 PASS; full e2e suite green except the pre-existing, already-ticketed `e2e-fullyparallel-signup-rate-limit` flake (confirmed unrelated to this change: isolated re-runs of every flagged test pass individually; a different unrelated test fails each full-suite run, matching the ticket's documented signature exactly); found and fixed ONE real defect (see below); browser QA walkthrough (Playwright MCP) confirmed Lisbon feed renders, Tokyo switch fully replaces content, and Plan this pre-seeds the builder; compose logs 0 ERROR/FATAL/Unhandled lines

**Defect found and fixed during Live Test & Fix**: the image `onError` fallback in `FeedItemCard` could miss a load failure that completes before React hydration attaches the listener (native `<img>` error fires during SSR-to-client handoff) — confirmed live via the route-abort e2e test, which failed against the built image showing the browser's native broken-image icon instead of the custom fallback. Fixed by checking `img.complete && img.naturalWidth === 0` in a mount-time `useEffect` as a backstop to the `onError` handler (`apps/web/app/(workspace)/discover/feed-item-card.tsx`). Re-verified green after rebuild.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories (T002's data module is read by every story).
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational and on `FeedItemCard` existing (T005, US1) for T011's wiring — otherwise independently testable via direct `/workspace?destination=` navigation even before T011 lands.
- **User Story 3 (Phase 5)**: Depends on Foundational (T002/T004). Independent of US1/US2 implementation-wise, though its e2e-adjacent check (T014) touches the same `FeedItemCard` from T005.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T002, T003, T004 (Phase 2) touch different files and can run in parallel.
- T013 (Phase 5) can run in parallel with Phase 4 (US2) work — different files (`discover-feed.test.ts` vs `planner.tsx`/`workspace/page.tsx`).
- T005 and T003 can run in parallel (component vs CSS), though T005 will reference the new CSS classes once both land.

---

## Parallel Example: Phase 2 (Foundational)

```bash
Task: "Create DiscoverFeedItem type + WHATS_HOT_FEED array in apps/web/lib/discover-feed.ts"
Task: "Add .tf-discover-* card classes to apps/web/app/globals.css"
Task: "Write apps/web/lib/__tests__/discover-feed.test.ts data-shape assertions"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1) — Discover shows a real, populated feed.
3. **STOP and VALIDATE**: manually browse Discover, confirm the feed and destination-switch behavior.
4. This alone already replaces the "coming soon" placeholder with real value, even before "Plan this" is wired (US2).

### Incremental Delivery

1. Setup + Foundational → data module + styling ready.
2. US1 → Discover feed is browsable (MVP).
3. US2 → "Plan this" closes PRD §9.7's hard rule (every item actionable) — required before this ticket is considered done, since FR-004/FR-005 are P1, not deferred.
4. US3 → imagery-integrity tests lock in the licensed/attributed guarantee (largely already satisfied by T002's content choice; this phase adds the regression tests that keep it true).
5. Polish → lint, quickstart validation, Live Test & Fix.

---

## Notes

- No `packages/` changes and no contract tests beyond `discover-to-builder-handoff.md`'s behavioral assertions (T012) — this feature has no new tRPC procedure (research.md Decision 1).
- Commit after each task or logical group, per this repo's per-ticket commit convention.
- US1 and US2 are both P1 in spec.md — both must ship this cycle for the ticket's PRD §9.7 hard rule ("every feed item is actionable") to hold; only US3 (P2) could theoretically slip to a follow-up if time runs out, but its scope here is small enough to include.
