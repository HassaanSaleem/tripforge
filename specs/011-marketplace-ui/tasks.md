# Tasks: Marketplace UI — browse, list, license

**Input**: Design documents from `/specs/011-marketplace-ui/`
**Prerequisites**: plan.md, spec.md, research.md (D1–D10), data-model.md, contracts/marketplace-ui.md, quickstart.md

**Tests**: Included — the repo's quality bar mandates L1 for every pure helper (FR-009), an L3 witness for the new procedure (FR-010), and an e2e journey for the live gate (INV-027).

**Organization**: Tasks are grouped by user story (US1 browse, US2 list, US3 license) so each story is independently implementable and testable.

## Phase 1: Setup

- [X] T001 Add marketplace/my-itineraries router-inference type aliases (`BrowseListingsOutput`, `CreateListingInput`, `CreateListingOutput`, `LicenseListingOutput`, `MyItinerariesOutput`) to `apps/web/lib/trpc/client.ts` (research D1; spec 008/009 precedent — no server type exports)

## Phase 2: Foundational (blocking prerequisites)

- [X] T002 Extract the digit-exact percent→bps mapper into new `apps/web/lib/basis-points.ts` (`percentToBps(raw, subject)` → `{bps}|{error}`, subject-interpolated messages) and refactor `toMarkupBps` in `apps/web/lib/booking-flow.ts` to delegate with subject "Markup" — exported signature and message strings byte-identical; existing `apps/web/lib/__tests__/booking-flow.test.ts` must pass unchanged (research D5, Pre-Write decision: generalize)
- [X] T003 Create the gated page shell: `apps/web/app/(workspace)/marketplace/page.tsx` (server component — `getWorkspaceIdentity` gate, membership prompt for non-agents, branded workspace header for agents, mounts the panel; `dynamic = "force-dynamic"`) + `apps/web/app/(workspace)/marketplace/marketplace-panel.tsx` client-component stub; add the Marketplace↔Workspace nav links to the shared header markup in `apps/web/app/(workspace)/workspace/page.tsx` and the new page (contract §1)
- [X] T004 [P] Add `.tf-market*` presentation classes (listing-card grid, terms rows, split-receipt panel, form column) to `apps/web/app/globals.css`, composing existing `.tf-*` primitives; no behavior, `[data-plain]` untouched (research D9)

**Checkpoint**: Page reachable and gated; helpers/kit ready for story work.

## Phase 3: User Story 1 — Browse the marketplace (P1) 🎯 MVP

**Goal**: A signed-in agent sees every active cross-tenant listing fully rendered; own listings marked; non-agents see the membership prompt.

**Independent Test**: With another agency's active listing in the DB, sign in and verify the card renders all published fields (spec US1 scenarios 1–5); sign out and verify the prompt.

- [X] T005 [US1] Implement browse view helpers in `apps/web/lib/marketplace-flow.ts`: `formatRating` (research D8), `formatShareBps` (display scaling only), `marketplaceErrorMessage` (transport table via `transportErrorMessage`) (contract §6)
- [X] T006 [P] [US1] L1 tests for T005 helpers in `apps/web/lib/__tests__/marketplace-flow.test.ts` (booking-flow.test.ts precedent; unrated/rated, scaling, UNAUTHORIZED/FORBIDDEN/network wording)
- [X] T007 [US1] Implement the browse section in `apps/web/app/(workspace)/marketplace/marketplace-panel.tsx`: `browseListings.query()` on mount with a reusable `loadListings()` (research D6), loading/failed/empty states, listing cards (title, seller, fee via `formatMinorAmount`, share, terms, rating, "Your listing" badge, license button only on non-mine cards), `data-testid` hooks (contract §3)

**Checkpoint**: US1 fully functional and independently demoable.

## Phase 4: User Story 2 — List a finished itinerary (P2)

**Goal**: An agent picks one of their own itineraries, declares terms, publishes; every typed refusal explained; new listing visible in browse without reload.

**Independent Test**: With a drafted itinerary, publish a listing and see it in browse marked as yours; re-submit and get the "already listed" notice (spec US2 scenarios 1–5).

- [X] T008 [US2] Add tenant-scoped read: new `packages/api/src/services/itineraries.ts` exporting `listItineraries(container, session)` → `{itineraries: [{id,title,currency,createdAt}]}` (`scopedWhere` on agencyId, newest first — INV-004) and wire a `list` query into `packages/api/src/routers/itinerary.ts` via `agentProcedure` (contract §2; research D3 — NOT in services/booking.ts)
- [X] T009 [P] [US2] L3 witness `packages/api/src/__tests__/l3-itinerary-list.test.ts` (harness precedent `l3-marketplace.test.ts`): two agencies, one itinerary each — each caller sees exactly its own row; anon UNAUTHORIZED / traveler FORBIDDEN
- [X] T010 [US2] Implement listing-form logic in `apps/web/lib/marketplace-flow.ts`: `toCreateListingInput(values, currency)` (picker/title/terms non-empty; fee major→minor via reused `currencyFractionDigits`; share via `percentToBps` subject "Revenue share") and `createListingFailureMessage` (exhaustive over `not_vetted | already_listed | provenance_incomplete`, issues rendered) (contract §6, research D4/D5/D7)
- [X] T011 [P] [US2] L1 tests for T010 in `apps/web/lib/__tests__/marketplace-flow.test.ts`: valid mapping (2-dp currency), non-numeric/negative/excess-precision fee, empty picker/title/terms, share bounds, every refusal message distinct, provenance issues included
- [X] T012 [US2] Implement the listing form in `marketplace-panel.tsx`: picker fed by `trpc.workspace.itinerary.list`, no-itineraries state linking to `/workspace`, currency shown read-only from the picked itinerary, submit → `createListing.mutate`, inline pure-mapped errors as `role="alert"`, success confirmation + `loadListings()` + form reset, refusal rendering (contract §4)

**Checkpoint**: US1+US2 work together; a real listing can be published from the UI.

## Phase 5: User Story 3 — License another agency's listing (P3)

**Goal**: An agent licenses a non-own listing and sees the white-label copy id + the recorded split verbatim; every typed refusal explained.

**Independent Test**: Against another agency's active listing, license it and verify the receipt's five recorded values render exactly; license again for the "already licensed" notice (spec US3 scenarios 1–4).

- [X] T013 [US3] Implement `licenseFailureMessage` (exhaustive over `not_vetted | own_listing | not_active | already_licensed`) in `apps/web/lib/marketplace-flow.ts` + L1 tests in `apps/web/lib/__tests__/marketplace-flow.test.ts` (contract §6, research D7)
- [X] T014 [US3] Implement the license action + split receipt in `marketplace-panel.tsx`: per-card busy state ("Licensing…"), success receipt (`data-testid="license-receipt"` — copy id in `<code>`, fee/seller credit/platform take via `formatMinorAmount` with the outcome's own currency, white-label wording) + `loadListings()`, inline refusals on the card (contract §5)

**Checkpoint**: Full trade loop usable in the browser.

## Phase 6: Polish & verification

- [X] T015 e2e journey `tests/e2e/marketplace-journey.spec.ts` (research D10; contract §7): agency A sign-up → draft → list → "Your listing" + no license button; agency B sign-up → cross-tenant browse → license → receipt integers + copy id → re-license refused; reuse `signUpAgency` from `tests/e2e/support.ts`
- [X] T016 Gates: `pnpm run lint` + root `pnpm test` green (in the built image per repo recipe); typecheck/depcruise clean
- [X] T017 Live Test & Fix (INV-027): `docker compose down -v && docker compose up --build --wait` → `node tests/integration/smoke.mjs` → `npx playwright test` → MCP browser QA journey with per-step screenshots to `.kitchenloop/evidence/3/seed-0009d/` → compose-log scan (`ERROR|FATAL|Unhandled`, empty allowlist) → fix/rebuild/re-test ≤ 3 cycles → teardown

## Dependencies & Execution Order

- **Setup (T001)** → everything (types used by all stories)
- **Foundational (T002–T004)**: T002 → T010 (percentToBps); T003 → T007/T012/T014 (panel host); T004 parallel-safe
- **US1 (T005–T007)**: no cross-story dependency — MVP increment
- **US2 (T008–T012)**: T008 → T009, T008 → T012; T010 → T011/T012; independent of US1 logic but renders into the same panel (after T007 in practice)
- **US3 (T013–T014)**: depends on browse cards (T007); independent of US2
- **Polish (T015–T017)**: after all stories; T015 before T017's playwright run

Parallel opportunities: T004 ∥ T002/T003; T006 ∥ T007; T009 ∥ T010–T012; T011 ∥ T012.

## Implementation Strategy

MVP = Phase 1–3 (browse renders real cross-tenant listings). Then US2 (supply
side), US3 (demand side), then the live verification phase. Single implementer,
sequential, one commit per coherent slice.
