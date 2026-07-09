# Tasks: Workspace AI Itinerary Planner UI

**Input**: Design documents from `/specs/008-planner-workspace-ui/`
**Prerequisites**: plan.md, spec.md, research.md (D1–D9), data-model.md, contracts/planner-ui.md, quickstart.md

**Tests**: Included — the repo quality bar requires L1 coverage for new logic (happy
path + primary error case) and the ticket's Live Test requires an e2e browser journey.

**Organization**: Tasks grouped by user story (US1 P1 core journey, US2 P2 failure
feedback, US3 P3 non-agent guardrail).

## Phase 1: Setup (dependency + test-infra wiring)

- [X] T001 Add `"@trpc/client": "11.18.0"` (exact pin, research D2) to the `dependencies` of `apps/web/package.json`
- [X] T002 Regenerate `pnpm-lock.yaml` for the new dependency via the dockerized lockfile-only install (loop denial recipe: `docker run --rm -v "$PWD:/w" -w /w node:22 sh -c "corepack enable && pnpm install --lockfile-only"`); verify the diff touches only `@trpc/client`-related entries
- [X] T003 Add `"apps/web/lib/**/*.test.ts"` to the `include` array of `vitest.config.ts` (research D8 — broadens the oracle, no existing assertion touched)

**Checkpoint**: `git diff` shows exactly the pinned dep, its lockfile entries, and one include line.

## Phase 2: Foundational (blocking prerequisite for all stories)

- [X] T004 Create the typed browser tRPC client in `apps/web/lib/trpc/client.ts`: `createTRPCClient<AppRouter>` with a single `httpBatchLink({ url: "/api/trpc" })`, no transformer, `AppRouter` imported type-only from `@tripforge/api` (research D1/D3); export the client plus a `DraftOutput` type derived via `inferRouterOutputs<AppRouter>["workspace"]["itinerary"]["draft"]` (research D5)

**Checkpoint**: `pnpm --filter @tripforge/web typecheck` passes (client compiles against the router type).

## Phase 3: User Story 1 — Agent drafts a trip plan from the workspace (P1) 🎯 MVP

**Goal**: Signed-in agent fills the trip form on `/workspace`, submits, and sees the
rendered draft itinerary (title, days, priced items, per-day subtotal, empty-day
note) plus the per-category budget-fit summary (contract §2.1).

**Independent Test**: quickstart.md §3 — browser journey from sign-up to a rendered
draft with no tooling beyond the browser.

- [X] T005 [US1] Create pure view-logic helpers in `apps/web/lib/planner-form.ts`: `PlannerFormValues` interface (data-model.md), `toTripRequest(values)` returning `{ request } | { error: string }` (trim/uppercase/omit-empty-optionals; checkOut-after-checkIn and positive-budget pre-checks; major→integer-minor conversion via `Intl` fraction digits, research D7) and `formatMinorAmount(amountMinor, currency)` (locale-pinned `en` formatting, research D7)
- [X] T006 [US1] Add L1 unit tests in `apps/web/lib/__tests__/planner-form.test.ts`: valid mapping (EUR two-decimal and a zero-decimal currency), each validation refusal (empty destination, unordered dates, non-positive budget, adults < 1), exact minor-unit round-trip (SC-004), `formatMinorAmount` output shapes
- [X] T007 [US1] Create the planner client component in `apps/web/app/(workspace)/workspace/planner.tsx`: controlled form per contract §2.1 (labels: Destination, Check-in, Check-out, Adults, Children, Trip style, Budget, Budget mode, Currency; submit "Draft itinerary"), `PlannerViewState` union (idle/drafting/drafted/failed, data-model.md), pending state disabling submit ("Drafting…", FR-003), call `workspace.itinerary.draft` via the T004 client, render the drafted document + fit in `data-testid="draft-result"` / `data-testid="budget-fit"` regions (title heading, `Day {n}` + date, item kind/title/sell price via `formatMinorAmount`, per-day subtotal, "No items planned." for empty days, budget summary rows allocated/planned/state + total + mode — FR-004/005, house styling per research D9)
- [X] T008 [US1] Wire the component into `apps/web/app/(workspace)/workspace/page.tsx`: render `<Planner />` inside the verified-agent branch below the greeting/sign-out (FR-010); the membership-prompt branch stays byte-identical (spec 007)
- [X] T009 [US1] Create the e2e journey spec `tests/e2e/planner-journey.spec.ts`: sign up a fresh agent (reuse the existing sign-in journey helpers/patterns from `tests/e2e/`), open `/workspace`, fill quickstart §3 values, submit, assert pending state then rendered title, ≥1 `Day` heading, ≥1 item line with a ` EUR` price, and the `budget-fit` table with the trip total (SC-001/SC-004 witnesses)

**Checkpoint**: US1 delivers the full MVP — plan a trip in the browser, see the draft.

## Phase 4: User Story 2 — Clear feedback when a draft cannot be produced (P2)

**Goal**: Every typed business failure and transport error renders as one distinct
human-readable message; the form survives failures (FR-006/007).

**Independent Test**: quickstart.md §4 — budget `1` yields a readable infeasibility
message with the form still editable.

- [X] T010 [US2] Add `draftFailureMessage(outcomeOrError)` to `apps/web/lib/planner-form.ts` implementing the full mapping table from data-model.md (infeasible budget_below_reserve/no_days, planner_failed malformed_output/no_proposals, TRPCClientError UNAUTHORIZED/FORBIDDEN/BAD_REQUEST, network/unknown fallback — research D6); the component may render only this helper's strings (contract §2.3)
- [X] T011 [US2] Extend `apps/web/lib/__tests__/planner-form.test.ts`: one assertion per mapping row (8 cases) — distinct, human-readable, no raw JSON/stack fragments (SC-002)
- [X] T012 [US2] Render the failure state in `apps/web/app/(workspace)/workspace/planner.tsx` (`role="alert"` region, form values retained, resubmit allowed) and extend `tests/e2e/planner-journey.spec.ts` with the infeasible-budget scenario (budget `1` → alert visible, no `draft-result` region, form still holds `Lisbon`)

**Checkpoint**: All draft outcomes produce visible, human-readable feedback.

## Phase 5: User Story 3 — Non-agents keep the membership prompt (P3)

**Goal**: Anonymous/traveler visitors see the unchanged membership prompt and never
the planner form (FR-008; INV-023/024 untouched).

**Independent Test**: quickstart.md §5 — signed-out `/workspace` shows the prompt,
no form.

- [X] T013 [US3] Extend `tests/e2e/planner-journey.spec.ts` with the signed-out assertions: `/workspace` without a session shows the membership prompt (sign-in and sign-up links) and has NO "Draft itinerary" button and no `draft-result` region (assertion ADDITIONS only; existing trust-boundary/smoke assertions untouched)

**Checkpoint**: Guardrail pinned by e2e; existing INV-024 specs still green.

## Phase 6: Polish & full verification

- [X] T014 Run gates in the built image (loop denial recipe): `pnpm run lint`, `pnpm test` (expect the new planner-form tests in the run), `pnpm --filter @tripforge/web typecheck`, dependency-cruiser clean
- [X] T015 Live Test & Fix (INV-027, quickstart.md §2–6): `docker compose down -v && docker compose up --build --wait`, `node tests/integration/smoke.mjs`, `npx playwright test` (full suite incl. the new journey), MCP browser QA journey with per-step screenshots to `.kitchenloop/evidence/iter-3/seed-0009a/`, compose-log scan (`ERROR|FATAL|Unhandled` minus allowlist), teardown. Fix cycle 1: the stack env carries ANTHROPIC_API_KEY, so live drafting runs the REAL Haiku tool loop (INV-013) — the journey spec, quickstart, and UAT card were made planner-agnostic (structure + exact money formatting asserted, never model-authored prose; 90s draft timeout); full e2e re-run 12/12 green

## Phase 7: Live Test & Fix cycle amendments (INV-027 — defects fixed in the same cycle; premium-bar update)

- [X] T016 Fix the live "empty itinerary" defect (FR-011, research D10): extract `canonicalCriteria(request)` in `packages/api/src/services/planner.ts`, shared by the pinned tool executors (`plannerToolDeps`) and `verifiedSupplyCatalog`, so model-phrased lookup criteria can no longer drop tool-returned proposals at assembly
- [X] T017 Add the env-gated L3 repro `packages/api/src/__tests__/l3-planner-verification.test.ts`: a sloppy-criteria LLM double (decorated destination, own transfer endpoints) must yield a drafted, persisted itinerary with all 3 items and canonical (`paris-…`) supply refs — fails as `planner_failed(no_proposals)` before T016
- [X] T018 Rebuild the surface on the seed-0009s theme kit (research D11): premium workspace shell (sticky branded header: name · agency · role badge · sign-out), `.tf-*` planner form/cards, timeline-dot item rows, budget-fit state badges, drafting/reveal motion (reduced-motion safe), label-wrapped-input typography hardening in `globals.css` — every §2.1 test-relied selector unchanged
- [X] T019 Witness the browser sign-up 403 (Better Auth origin check) against the live stack: NOT REPRODUCIBLE on the canonical origin — UI sign-up succeeded in the MCP QA journey and in `sign-in.spec.ts`/`planner-journey.spec.ts` (12/12 e2e green) against `http://localhost:3000` with `BETTER_AUTH_URL=http://localhost:3000`. Root cause of the prior session's 403: origin mismatch when the stack serves on a NON-canonical origin (alternate-port compose project, or `127.0.0.1` vs `localhost`) while `BETTER_AUTH_URL` stays pinned — an environment/config alignment issue, not a product defect. Resolution: when booting on an alternate origin, set `BETTER_AUTH_URL` to that origin; the origin check itself stays strict (never weakened). Recorded in the PR Live Test Evidence.
- [X] T020 Restore the accessible "TripForge" brand heading on the landing page (`smoke.spec.ts:11` red on main since the premium-landing rebuild dropped it — `div.tf-brand` → `h1.tf-brand`, margin-hardened in globals.css); witnessed red-then-green in this cycle's full e2e run

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6.
- US2 depends on US1's component/module files (extends them). US3 is test-only and
  independent of US2 (needs only US1's page wiring).
- Within US1: T005 → T006; T005+T004 → T007 → T008 → T009. T005 and T007 scaffolding
  could start in parallel, but they share review context — sequential is fine solo.

## Parallel Opportunities

- [P] markers are minimal by design: this is a single-surface UI feature worked by
  one implementer; T001/T003 touch different files and could run together, and T005
  (lib) vs T007 (component) are different files once T004 exists.

## Implementation Strategy

MVP = Phase 1–3 (US1). US2 (failure mapping) and US3 (guardrail e2e) complete the
spec's success criteria and ship in the same PR per the loop's one-feature-one-PR
cycle. Every task keeps zero server-side changes — any need to touch `packages/*`
(other than nothing) or a new procedure is a STOP-and-respec signal.
