# Tasks: Booking Flow UI — Quote → Review → Book

**Input**: Design documents from `/specs/009-booking-flow-ui/`
**Prerequisites**: plan.md, spec.md, research.md (D1–D10), data-model.md, contracts/booking-ui.md, quickstart.md

**Tests**: Included — the repo quality bar requires L1 coverage for new logic (happy
path + primary error case) and the ticket's Live Test requires an e2e browser
journey. No new L2/L3: zero server code changes; the existing spec 005 L3 money-path
suite remains the server gate (research D8).

**Organization**: Tasks grouped by user story (US1 P1 quote+review with markup, US2
P1 book+confirmation, US3 P2 failure feedback, US4 P3 non-agent guardrail).

## Phase 1: Setup

*No setup tasks — no new dependencies (`@trpc/client` landed with spec 008), no
test-infra changes (`apps/web/lib/**/*.test.ts` already in the Vitest include).*

## Phase 2: Foundational (blocking prerequisites for all stories)

- [X] T001 Extend the typed browser tRPC client `apps/web/lib/trpc/client.ts` with inferred booking types (research D1): `QuoteInput`/`QuoteOutput` and `BookInput`/`BookOutput` via `inferRouterInputs`/`inferRouterOutputs` over `workspace.booking.quote`/`workspace.booking.book`, exported alongside the existing `DraftInput`/`DraftOutput` (no new client instance, no transformer)
- [X] T002 Create the generalized transport-error helper `apps/web/lib/transport-error.ts` (research D6): `transportErrorMessage(error: unknown, wording: { forbidden: string; badRequest: string; notFound?: string }): string` — `TRPCClientError` code dispatch with the shared UNAUTHORIZED string ("Your session has expired. Please sign in again.") and shared network fallback ("Could not reach the server. Check your connection and try again."); NOT_FOUND falls through to the fallback unless `wording.notFound` is provided
- [X] T003 Refactor `draftErrorMessage` in `apps/web/lib/planner-form.ts` to delegate to `transportErrorMessage` with its existing FORBIDDEN/BAD_REQUEST strings — public signature and every returned string byte-identical; prove it by running the existing `apps/web/lib/__tests__/planner-form.test.ts` unchanged (must stay green)

**Checkpoint**: `tsc` clean for apps/web; existing planner-form L1 tests green untouched.

## Phase 3: User Story 1 — Agent quotes a drafted trip with markup control (P1) 🎯 MVP

**Goal**: Below a rendered draft, the agent sets Markup % (default 15), clicks
"Quote live prices", and reviews per-item net rate, sell price, markup, and "Held
until {time}" — with typed per-item quote failures mapped to distinct messages
(contract §2.1).

**Independent Test**: quickstart.md §2 steps 1–3 — browser journey from a rendered
draft to a populated quote review, no tooling beyond the browser.

- [X] T004 [US1] Create pure view-logic helpers in `apps/web/lib/booking-flow.ts` (research D4/D5/D6/D7, data-model.md): `toMarkupBps(raw: string): { bps: number } | { error: string }` (default handling done by the component; refuse non-finite, <0, >100, non-integer-bps values); `quoteFailureMessage(reason)` exhaustive over `unknown_offer | no_rate | already_booked` with the exact data-model.md strings; `formatMarkupBps(bps: number): string` (1500 → "15%"); `formatHoldExpiry(iso: string): string` ("Held until {local time}" via `Intl.DateTimeFormat("en", { hour, minute, timeZoneName: "short" })`); `itemMetaIndex(itinerary): Map<string, { title: string; kind: string }>` with raw-id fallback accessor
- [X] T005 [US1] Add L1 unit tests in `apps/web/lib/__tests__/booking-flow.test.ts` for the T004 helpers: markup bounds (0, 100, 15 default→1500, 12.5→1250, refusals for "", "-1", "101", "12.345", "abc"), every quote-failure string, formatMarkupBps outputs (0→"0%", 1500→"15%", 1225→"12.25%"), formatHoldExpiry structure ("Held until " prefix + non-empty tail), itemMetaIndex join + unknown-id fallback
- [X] T006 [US1] Create the booking client component `apps/web/app/(workspace)/workspace/booking-flow.tsx` (research D2/D3): props `{ itinerary }` (drafted canonical document); `BookingViewState` union (idle/quoting/reviewed/booking/concluded/failed) + `Set<quoteRowId>` selection; markup input labeled "Markup %" (default "15", `type="number"`, min 0, max 100, step 0.01); "Quote live prices" button → `trpc.workspace.booking.quote.mutate({ itineraryId: itinerary.id, markupBps })` (pending: disabled + "Quoting…", refuse duplicate submission — FR-004); render the `data-testid="quote-review"` region per contract §2.1: held rows (title+kind via itemMetaIndex, net `formatMinorAmount(netMinor, netCurrency)`, sell `formatMinorAmount(sellMinor, currency)`, `formatMarkupBps(markupBps)`, `formatHoldExpiry(expiresAt)`, checkbox checked by default), failed rows (title + `quoteFailureMessage`, not selectable), all-failed notice when zero holds
- [X] T007 [US1] Compose the flow into the planner: in `apps/web/app/(workspace)/workspace/planner.tsx` render `<BookingFlow key={outcome.itinerary.id} itinerary={outcome.itinerary} />` inside the `drafted` branch below `DraftResult` (research D2 — reset-by-key on a new draft); no other planner behavior or selector changes
- [X] T008 [US1] Add additive `.tf-booking-*` styles to `apps/web/app/globals.css` (research D9): booking card section, quote-review table (net/sell/markup/held-until columns, tabular numerals via `.tf-price`), selection checkbox row states, held/failed row tints reusing `--ok-tint`/`--warn-tint`, pending spinner reuse (`.tf-spin`) — presentation only, no selector the tests rely on beyond the contract's testids/names

**Checkpoint**: US1 independently verifiable — draft → quote → review renders live
prices with markup and expiry; `pnpm test` green with the new L1 suite.

## Phase 4: User Story 2 — Agent books held quotes and sees confirmation (P1)

**Goal**: The agent books the selected holds and sees the confirmation: status
label, booking reference, per-component supplier reference + sell price or typed
failure (contract §2.2).

**Independent Test**: quickstart.md §2 steps 4–5 — book the review's holds, see
"Booking confirmed" with per-component references; re-quote reports items already
booked.

- [X] T009 [US2] Extend `apps/web/lib/booking-flow.ts` with the book-side mappers (data-model.md): `bookFailureMessage(reason)` exhaustive over `quote_expired | supplier_rejected | unknown_quote | already_consumed | item_already_booked`; `bookStatusLabel(status)` over `confirmed | partially_confirmed | failed` — exact data-model.md strings
- [X] T010 [US2] Extend `apps/web/lib/__tests__/booking-flow.test.ts`: every book-failure string and every status label (exhaustiveness pinned so a new server reason fails compilation — same pattern as planner-form)
- [X] T011 [US2] Extend `apps/web/app/(workspace)/workspace/booking-flow.tsx` with the book action + confirmation (research D3/D10): "Book selected items" button (disabled when zero selected or request in flight; pending "Booking…") → `trpc.workspace.booking.book.mutate({ itineraryId, quoteRowIds: [...selection] })`; on response render `data-testid="booking-confirmation"` per contract §2.2 (status via `bookStatusLabel`, booking reference when present, per-component lines: confirmed → title + supplier booking reference + sell price; failed → title + `bookFailureMessage`); confirmation replaces the review and stays on screen (INV-016); quote controls stay usable — a fresh quote replaces the confirmation with a new review (FR-008)

**Checkpoint**: US1+US2 together complete the money-path journey (SC-001); the
platform's `already_booked` re-quote truth renders (research D10).

## Phase 5: User Story 3 — Clear feedback when quoting or booking cannot complete (P2)

**Goal**: Every transport/authorization failure maps to one human-readable message
in a `role="alert"` region; review state survives failures; re-quote is always
available (contract §2.3).

**Independent Test**: quickstart.md §Expected outcomes SC-002 — force a transport
failure (or an expired hold) and observe the mapped message with the flow intact.

- [X] T012 [US3] Wire transport-error mapping into `apps/web/app/(workspace)/workspace/booking-flow.tsx`: wrap both mutations; on throw set `failed { message: transportErrorMessage(error, bookingWording) }` with the data-model.md booking wording (FORBIDDEN "Booking requires an agency membership…", BAD_REQUEST "The server rejected the booking request…", NOT_FOUND "This itinerary is no longer available in your workspace."); render the message in a `role="alert"` region; the drafted itinerary stays on screen and the quote action stays available (FR-006/FR-008)
- [X] T013 [US3] Extend `apps/web/lib/__tests__/booking-flow.test.ts` (or a dedicated `transport-error.test.ts`) covering `transportErrorMessage`: each booking-wording code (UNAUTHORIZED/FORBIDDEN/BAD_REQUEST/NOT_FOUND via TRPCClientError fixtures), non-TRPC error → network fallback, and the planner delegation regression (draft wording unchanged — reuse existing fixtures pattern from planner-form tests)

**Checkpoint**: SC-002 pinned at L1 — every typed and transport failure has exactly
one human string; no raw payload can reach the DOM through these paths.

## Phase 6: User Story 4 — Non-agents never see booking controls (P3)

**Goal**: Anonymous/traveler visitors keep the membership prompt; zero booking
controls render (contract §2.4).

**Independent Test**: quickstart.md §2 step 6 — signed-out `/workspace` has no
Markup/Quote/Book controls.

- [X] T014 [US4] No code task — the guardrail is structural (BookingFlow renders only inside the planner's drafted branch, research D2). Verify by inspection that `booking-flow.tsx` is imported only by `planner.tsx` and record the check in the PR body; the e2e assertion lands in T015

## Phase 7: e2e journey + Live Test & Fix gate (INV-027)

- [X] T015 Create `tests/e2e/booking-journey.spec.ts` (research D8, serial like planner-journey.spec.ts): fresh self-serve sign-up → draft the proven trip (Paris, 2026-09-01→04, 2 adults, balanced, 1000 USD hardCap; generous draft timeout for keyed stacks) → assert booking controls present (Markup % = 15, "Quote live prices") → quote: observe pending state (route-hold pattern), then `quote-review` rows with ` USD` prices, a `%` markup, "Held until" text, checked checkboxes → book: "Book selected items", observe "Booking…", then `booking-confirmation` with "Booking confirmed", a booking reference, per-component supplier reference + ` USD` price → re-quote: rows report "Already booked — this item is covered by an existing booking." and book stays disabled → sign out → `/workspace` shows the membership prompt and no "Quote live prices"/"Markup %"/"Book selected items" anywhere (US4)
- [X] T016 Run the local gates: `pnpm run lint` and `pnpm test` (in-image variants per quickstart §4 when host pnpm is denied) — all green, zero weakened assertions
- [X] T017 Live Test & Fix (INV-027, kitchenloop.yaml `verification.live`): `docker compose down -v && docker compose up --build --wait`; `node tests/integration/smoke.mjs`; `npx playwright test` (full e2e suite incl. T015); drive the quote→book journey via Playwright MCP as QA with per-step screenshots archived to `.kitchenloop/evidence/iter-3/seed-0009b/`; capture `docker compose logs --no-color` to the evidence dir and scan against `ERROR|FATAL|Unhandled` (allowlist empty — any non-documented match fails); fix→rebuild→re-test defects in-cycle (max 3); teardown `docker compose down -v` when done
- [X] T018 Verify quickstart.md §2 money check against the live DB (sell prices on screen == `booking_quote.sell_minor` == `booking_component.sell_minor`) and record the witness in the PR's Live Test Evidence section

## Dependencies

- Phase 2 (T001–T003) blocks everything.
- US1 (T004–T008) blocks US2 (T009–T011) — same component/file lineage.
- US3 (T012–T013) needs US1's component; independent of US2 but lands after to
  avoid file contention.
- T015 needs US1+US2+US4 complete; T016–T018 close the cycle.

## Parallel opportunities

- T002 [P] with T001 (different files); T003 after T002.
- T004/T005 pair; T008 [P] with T006 (different files) once T004 exists.
- T010 [P] with T011 after T009.
- Within Phase 7, T016 can start while T015 is being authored, but the live gate
  (T017) requires all code final.

## Implementation strategy

MVP = Phase 2 + US1 (quote review visible in the browser). US2 completes the
ticket's core demand and ships in the same PR; US3/US4 are small hardening
increments on the same component. One PR carries all phases (kitchen-loop case (a)
solo feature cycle).
