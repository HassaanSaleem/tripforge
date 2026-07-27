# Tasks: Consumer Chat-First AI Planner

Dependency-ordered. `[P]` = parallelizable with siblings.

## Phase A — Data layer

- **T001** NEW `packages/db/src/schema-consumer-planner.ts`: `consumer_plan_request` table
  (data-model §1), with the `(traveler_user_id, created_at)` index. Bolt-on comment (NOT
  canonical schema, NOT money path).
- **T002** CHANGE `packages/db/src/schema.ts`: export + register `consumerPlanRequest` in the
  barrel and the `schema` object.
- **T003** CHANGE `packages/db/src/index.ts`: re-export `consumerPlanRequest` for services.

## Phase B — Engine refactor (behavior-preserving, reuse-not-fork) — depends on nothing

- **T010** CHANGE `packages/api/src/services/planner.ts`:
  - `interpretChatTripRequest(container, input)` — drop the unused `_session` param.
  - `plannerCore(container, agencyId: string, input)` and `draftOptions(container, agencyId,
    input)` — take `agencyId` instead of `AgentSessionContext`.
  - `selectDraftOption` unchanged externally; internally
    `plannerCore(container, session.agencyId, input.tripRequest)`.
  - Export `interpretChatRequestInputSchema` (currently local to `itinerary.ts`) for reuse.
- **T011** CHANGE `packages/api/src/routers/itinerary.ts`: update the agent `draft` and
  `interpretChatRequest` call-sites to the new signatures. No behavior change.

## Phase C — Consumer service — depends on A, B

- **T020** NEW `packages/api/src/services/consumer-planner.ts`:
  - `draftConsumerOptions(container, input: TripRequest)` async generator: ephemeral
    `randomUUID()` agencyId → `draftOptions` → map each `DraftOption` to `ConsumerDraftOption`
    via `toClientItineraryView` (redacted). Never persists. (data-model §3, contract §2)
  - `submitConsumerPlanRequestInputSchema` + `submitConsumerPlanRequest(container, session,
    input)`: insert one `consumer_plan_request` row (contract §3, data-model §1).
  - `ConsumerDraftOption` / outcome types exported (inference-load-bearing for the router
    subscription return type).

## Phase D — Router — depends on C

- **T030** CHANGE `packages/api/src/routers/client-view.ts`: add `planInterpret` (mutation,
  reuses `interpretChatRequestInputSchema` + `interpretChatTripRequest`), `planDraft`
  (subscription → `draftConsumerOptions`), `requestPlan` (mutation →
  `submitConsumerPlanRequest`). All `protectedProcedure`. (contract §1–3)

## Phase E — Consumer UI — depends on D

- **T040** NEW `apps/web/app/(client-view)/view/plan/page.tsx`: signed-in-only page (redirect
  anonymous to `/view/sign-in?...returnTo`), wraps `ConsumerPlanner` in `ClientSurfaceShell
  activeNav="plan"`.
- **T041** NEW `apps/web/app/(client-view)/view/plan/consumer-planner.tsx` (`"use client"`):
  brand-neutral chat → **Build my trip** → compare (redacted options, per-category breakdown,
  sell prices only) → pick → fork (request-agent form prefilled from `clientView.me`; and the
  honest "Book it myself" signpost). Uses `lib/trpc/client` (mutation + subscription like
  `planner.tsx`). (spec US1/US2, quickstart)
- **T042** CHANGE `apps/web/lib/client-nav.ts`: `plan` destination `status "soon"→"live"`,
  `href "/view/plan"` (removes the "Soon" badge; makes it a live `<Link>`). (spec US3)
- **T043** CHANGE `apps/web/app/(client-view)/view/page.tsx`: the "Plan a trip" home tile →
  a live link to `/view/plan` (drop `aria-disabled`/coming-soon styling). (spec US3)

## Phase F — Tests — depends on C/D (L3) and E (e2e)

- **T050** NEW `packages/api/src/__tests__/l3-consumer-planner.test.ts`: interpret(resolved) →
  draft(1–3 live-priced, redacted: assert no `netRate`/supplyRef in payload) →
  requestPlan(inserts one row); assert NO `booking`/`markup_ledger`/`itinerary`/`trip_created`
  write; missing `contactName` → rejected, zero rows. (SC-001..SC-004)
- **T051** NEW `packages/api/src/__tests__/consumer-planner-rbac.test.ts`: a traveler
  `SessionContext` (no agencyId) invoking the agent `workspace.itinerary.draft` procedure →
  FORBIDDEN (INV-024 negative). Reuse the caller-factory pattern from existing rbac tests.
- **T052** CHANGE `packages/api/src/__tests__/client-view-projection.test.ts` (or add near it):
  assert a `ConsumerDraftOption` exposes sell price only.
- **T053** NEW `tests/e2e/consumer-planner-journey.spec.ts`: full traveler journey
  (quickstart). Add any shared helper to `tests/e2e/support.ts` if needed.

## Phase G — Verify

- **T060** `pnpm run lint` && `pnpm test` green.
- **T061** Live Test & Fix (INV-027): boot built stack → smoke + e2e → Playwright MCP browser
  journey with per-step screenshots → compose-log scan → fix/rebuild as needed.
