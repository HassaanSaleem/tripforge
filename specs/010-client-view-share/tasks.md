# Tasks: Client-View UI — Shared Itinerary with Agency White-Label Branding (spec 010)

**Input**: plan.md, research.md (D1–D11), data-model.md, contracts/client-view.md,
quickstart.md. Tests are REQUIRED (quality bar: L3 for integration points; INV-027
live verification; trust-boundary e2e must stay green).

**Organization**: foundational redaction/service/router work first (blocks every
story), then user stories in priority order. US1 = MVP (anonymous branded view).

## Phase 1: Setup

*(No new dependencies, no scaffolding — existing monorepo. No tasks.)*

## Phase 2: Foundational (blocking all user stories)

- [X] T001 Add `itineraryShareLink` table (token uuid PK defaultRandom, agencyId → organization cascade, itineraryId UNIQUE → itinerary cascade, createdAt) to `packages/db/src/schema.ts` + schema map export (data-model §1, research D1/D9 — DB schema only, NOT a canonical-schema change)
- [X] T002 Create `packages/api/src/services/client-view.ts`: `ClientItineraryView` types + PURE `toClientItineraryView(document, agencyName, bookedItemIds)` allowlist projection with domain `addMoney` total fold (data-model §2, research D2/D8; Pre-Write: reuse `addMoney`, new projection)
- [X] T003 [P] L1 tests `packages/api/src/__tests__/client-view-projection.test.ts`: allowlist output shape; full serialized payload contains NO `netRate`/`supplyRef`/`provenance`/`budgetMode`/`tripRequest`/`agencyId` keys or values; total = addMoney fold; total null when unpriced; unpriced item → sellMinor null; empty days/items; booked flag from set membership
- [X] T004 Add `createShareLink` (tenant-scoped ownership check → NOT_FOUND, INSERT ON CONFLICT (itinerary_id) DO NOTHING → SELECT, returns {status:"shared", token, path}) and `resolveShareLink` (token → link row → parseItinerary document + `getOrganizationName` + booking_component itemId set → {found, view} | {not_found}) in `packages/api/src/services/client-view.ts` (data-model §3, research D6/D9)
- [X] T005 Wire routers: `share` mutation (agentProcedure, strict `{itineraryId: uuid}`) in `packages/api/src/routers/itinerary.ts`; NEW public router `packages/api/src/routers/client-view.ts` (`itinerary: publicProcedure({token: uuid}) → typed union`); mount `clientView` in `packages/api/src/routers/root.ts` (contract §1–2)
- [X] T006 Web plumbing: server-side caller — `createCallerFactory`/`createAppCaller` exported from `@tripforge/api` (with the client-view outcome types on the package surface per the TS4023 entry-export rule) and `getAnonymousCaller()` in `apps/web/lib/trpc/server.ts` for server components (research D3). *Deviation from the original wording: no new inferred type aliases were added to `apps/web/lib/trpc/client.ts` — the share mutation and server caller are fully typed by inference already, and an unconsumed alias would violate the QS3-1 premature-export rule.*

**Checkpoint**: `pnpm test` green (L1 projection), typecheck clean — no UI yet.

## Phase 3: User Story 1 — Traveler opens a shared itinerary link (P1) 🎯 MVP

**Goal**: anonymous `/view/{token}` renders the branded, redacted, read-only itinerary.

**Independent test**: seed a share link in Postgres, open `/view/{token}` in a
cookie-less browser: agency name present, platform naming absent (body+title),
sell prices shown, zero confidential values in the delivered payload.

- [X] T007 [US1] Create `apps/web/app/(client-view)/view/[token]/page.tsx`: async server component, `dynamic = "force-dynamic"`, React `cache()`-deduped resolve via the server caller; invalid-uuid token short-circuits to not-found state; renders agency brand line, trip title, day-by-day items (kind, title, schedule facts, `formatMinorAmount(sellMinor)`), trip total row when non-null, neutral unavailable state; `generateMetadata` → `"{title} — {agencyName}"`, neutral description, `robots: noindex` (contract §3, research D4/D11; INV-020/024 — no platform naming, no workspace affordances; existing `/view` page byte-untouched)
- [X] T008 [P] [US1] Additive `.tf-client-*` styles in `apps/web/app/globals.css` (branded header line, day cards, item rows, price alignment, booked badge, unavailable state) to the seed-0009s premium bar — presentation only, works under the `[data-plain]` white-label opt-out
- [X] T009 [US1] L3 resolve tests in `packages/api/src/__tests__/l3-client-view.test.ts` (env-gated DATABASE_URL, l3-marketplace pattern): seeded link resolves `found` with agency name + sell prices; **full JSON payload scan** — zero `netRate`/`netMinor`/`markup`/`supplyRef`/`provenance`/`budgetMode`/`tripRequest` occurrences (SC-003); unknown token → `not_found`; deleted itinerary (cascade) → `not_found`

**Checkpoint**: US1 independently demoable with a seeded link.

## Phase 4: User Story 2 — Agent shares from the workspace (P2)

**Goal**: one click in the drafted planner state mints/returns the durable link.

**Independent test**: sign in as agent, draft, click share → URL shown; share again →
same URL; anon/traveler share attempts refused.

- [X] T010 [P] [US2] Pure view logic `apps/web/lib/share-control.ts` (absolute URL from path + origin, `shareErrorMessage` via existing `transport-error.ts`) + L1 tests `apps/web/lib/__tests__/share-control.test.ts` (research D5; Pre-Write: reuse transport-error)
- [X] T011 [US2] Client component `apps/web/app/(workspace)/workspace/share-control.tsx` (share button → mutation → URL display + clipboard copy w/ confirmation, error state) and compose `<ShareControl>` into the drafted state of `apps/web/app/(workspace)/workspace/planner.tsx` (keyed with the draft, spec 009 precedent; contract §4)
- [X] T012 [US2] L3 share tests in `packages/api/src/__tests__/l3-client-view.test.ts`: create → row + uuid token; re-share → SAME token; `Promise.all` concurrent shares → exactly 1 row, same token (SC-006); cross-tenant share → NOT_FOUND identical to unknown itinerary (FR-002); anon → UNAUTHORIZED, traveler session → FORBIDDEN (INV-023)
- [X] T013 [US2] L4 journey `tests/e2e/client-view-journey.spec.ts`: sign-up (agent+agency) → draft → share → read URL → open in a FRESH anonymous browser context → assert agency name, day/items + sell price, booked-free proposal state, tab title = trip — agency (NOT TripForge/Trellis), body free of platform naming + `netRate`/`markup` strings, no workspace affordances; unknown-token page renders unavailable state (INV-020/024 negatives on the tokenized page)
- [X] T014 [US2] Extend `tests/integration/smoke.mjs` per contract §5: share → uuid token; re-share same token; anonymous resolve `found` + payload confidentiality scan; anonymous GET `/view/{token}` 200 + agency name + no platform naming; random token → `not_found`

**Checkpoint**: full share→view demo path works end-to-end in a browser.

## Phase 5: User Story 3 — Booked items visibly confirmed (P3)

**Goal**: items covered by a confirmed booking carry a "Booked" badge.

**Independent test**: book one item of a shared itinerary, reload the link — exactly
that item shows the badge.

- [X] T015 [US3] Booked badge rendering in `apps/web/app/(client-view)/view/[token]/page.tsx` (`.tf-client-booked`, visible text "Booked") for `item.booked === true` (FR-009 — resolution wiring already in T004)
- [X] T016 [US3] L3 booked-mark test in `packages/api/src/__tests__/l3-client-view.test.ts`: seed booking + booking_component for ONE item → resolve → exactly that item `booked: true`, others false; no-booking itinerary → all false (US3 AS1/AS2)

## Phase 6: Polish & gates

- [X] T017 Full deterministic gates: `pnpm run lint`, workspace typecheck, depcruise, `pnpm test` (in-image against compose Postgres when host pnpm is denied — memory recipe), `npx playwright test` FULL suite — `trust-boundary.spec.ts` + `smoke.spec.ts` must be green UNTOUCHED
- [X] T018 Live Test & Fix (INV-027, kitchenloop.yaml `verification.live`): fresh `docker compose down -v && up --build --wait`; `node tests/integration/smoke.mjs`; e2e; Playwright-MCP QA journey with per-step screenshots to `.kitchenloop/evidence/iter-3/seed-0009c/`; compose-log scan vs `ERROR|FATAL|Unhandled` (empty allowlist + documented-benign L3-race line); quickstart §5 manual spot-checks incl. page-source confidentiality grep

## Dependencies & execution order

- Phase 2 strictly first: T001 → {T002, T004} → T005 → T006 (T003 parallel with T004+).
- US1 (T007–T009) after T006; T008 parallel with T007.
- US2 (T010–T014) after T006; T010 parallel with T011; T012–T014 after T005 (T013/T014 also need T007+T011 for the full journey).
- US3 (T015–T016) after T007 (badge) — resolution logic already lands in T004.
- Phase 6 last, in order T017 → T018.

**MVP scope**: Phase 2 + Phase 3 (US1) — a seeded link proves the entire trust
boundary. US2 completes the operator demo path; US3 is the trust signal.
