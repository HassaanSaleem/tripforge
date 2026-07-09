# Research: Booking Flow UI — Quote → Review → Book

**Feature**: specs/009-booking-flow-ui | **Date**: 2026-07-09

No NEEDS CLARIFICATION markers remained in the Technical Context; the decisions
below resolve the design unknowns against the existing codebase (spec 008
precedents, the spec 005 booking contract, and the seed-0009s theme kit).

## D1 — Transport: reuse the spec 008 typed browser tRPC client

**Decision**: Call `workspace.booking.quote` / `workspace.booking.book` through the
existing `apps/web/lib/trpc/client.ts` (`createTRPCClient<AppRouter>`, one
`httpBatchLink({ url: "/api/trpc" })`, session via same-origin cookie), extending
that module with inferred types — `QuoteInput`/`QuoteOutput`,
`BookInput`/`BookOutput` via `inferRouterInputs`/`inferRouterOutputs` — exactly as
it already exposes `DraftInput`/`DraftOutput`.

**Rationale**: INV-018 (one client API surface); the server's outcome types stay
un-exported (QS3-1 premature-export rule) while inference keeps the client exactly
in sync with the deployed contract (spec 008 research D5). Pre-Write: **extend**
(`apps/web/lib/trpc/client.ts`).

**Alternatives considered**: a second tRPC client instance for booking (violates
the one-surface pattern for no benefit); exporting the server's outcome types from
`@tripforge/api` (rejected by the premature-export rule — inference already works).

## D2 — Placement: compose the booking flow inside the planner's drafted state

**Decision**: A new `BookingFlow` client component rendered by `Planner`'s
`drafted` branch, receiving the drafted canonical document. The itinerary id for
quote/book calls is the document's own `id` — the planner service persists the row
under the same UUID it stamps into the document (`packages/api/src/services/planner.ts`:
one `id` feeds both `assembleItinerary` and the `itineraryTable` insert), so no new
plumbing is needed. Keyed by `itinerary.id` so drafting a new trip resets the flow.

**Rationale**: FR-001 scopes booking controls to a rendered draft; composing inside
the drafted branch makes the non-agent guardrail (FR-009/US4) structural — the
component cannot render outside a verified agent's draft. Matches the spec 008
component pattern (server page gates, client component acts).

**Alternatives considered**: a separate `/workspace/booking/[id]` page (needs a
persisted-itinerary listing/reload surface — explicitly out of scope; more routes
to gate); embedding booking state inside `Planner` itself (bloats one component
past the planner/booking concern boundary).

## D3 — View state: one explicit machine per concern

**Decision**: `BookingViewState` union mirroring the planner's pattern:
`idle → quoting → reviewed(items) → booking → concluded(outcome)` plus
`failed(message)` for transport errors; selection is a `Set<quoteRowId>`
initialized to every held quote when a quote response lands (FR-004 pre-selected
default). Re-quote is available from `reviewed`, `concluded`, and `failed`
(FR-008); in-flight states disable both actions (duplicate-submission refusal,
FR-004).

**Rationale**: Typed exhaustive view states are the established pattern
(planner.tsx `PlannerViewState`); a Set keyed by the server's own quoteRowId means
booking sends exactly the holds on screen (spec edge case: "booking uses exactly
the holds on screen").

**Alternatives considered**: react-query/TanStack mutation state (new dependency,
overkill for two mutations); deriving selection from DOM inputs (unkeyed,
un-testable).

## D4 — Item metadata join: client-side id → title/kind lookup

**Decision**: A pure helper builds `Map<itemId, {title, kind}>` from the rendered
canonical document; the review list and confirmation panel display quote/book
outcomes joined against it. Unknown item ids (impossible today — quotes are minted
from the same document — but typed as possible) fall back to the item id string.

**Rationale**: The quote/book responses carry `itemId` only (spec 005 contract §3–4
keeps money rows lean); the document is already in memory on this screen. A display
join is not money arithmetic (FR-007 untouched).

**Alternatives considered**: asking the server to denormalize titles into quote
outcomes (server contract change — forbidden by FR-002/FR-005); rendering bare item
ids (fails the premium bar and FR-003's "name and kind").

## D5 — Markup input: percent in the UI, integer basis points on the wire

**Decision**: A required numeric input "Markup %" (default **15**, min 0, max 100,
step 0.01) mapped by a pure helper `toMarkupBps(raw: string)` →
`{ bps: number } | { error: string }`, converting percent → integer basis points
exactly once (`Math.round(percent * 100)`), refusing non-finite, negative, >100%,
and non-integer-bps-representable values with inline messages before any server
call. The quote mutation receives `{ itineraryId, markupBps }`.

**Rationale**: The procedure's unit is basis points (int 0–10000, default 1500 —
`quoteInputSchema`); agents think in percent. Mirrors spec 008's budget major→minor
rule (FR-009 there; FR-002/FR-007 here): one explicit conversion at the input
boundary, no money involved (markup is a rate, not an amount — INV-010's money
math stays server-side in `applyMarkupBps`).

**Alternatives considered**: raw bps input (hostile UX for the demo bar); a slider
(imprecise for a professional margin lever).

## D6 — Failure → message mapping: pure helpers; generalize the transport mapper

**Decision**: `apps/web/lib/booking-flow.ts` exports DOM-free mapping helpers,
exhaustive over the server unions (a new server reason fails compilation, the spec
008 precedent): `quoteFailureMessage(reason)` for `unknown_offer | no_rate |
already_booked`; `bookFailureMessage(reason)` for `quote_expired |
supplier_rejected | unknown_quote | already_consumed | item_already_booked`;
`bookStatusLabel(status)` for `confirmed | partially_confirmed | failed`. Transport
errors: a new generalized `transportErrorMessage(error, wording)` in
`apps/web/lib/transport-error.ts` handles the shared TRPCClientError→code→string
shape (UNAUTHORIZED and network fallback shared; FORBIDDEN/BAD_REQUEST/NOT_FOUND
wording injected per feature). `planner-form.ts`'s `draftErrorMessage` delegates to
it with its existing strings — public API and every returned string unchanged, so
the existing L1 tests must pass untouched.

**Rationale**: FR-006 requires distinct human strings from pure mapping logic
(contract §2.3 pattern from spec 008). Duplicating the transport mapper would add a
fourth clone cluster while the repo sits at 2.34% duplication vs the 1% sweep
threshold — the extraction-threshold rule (2+ callsites share a shape → hoist the
named concept) says generalize now. Pre-Write: **generalize**
(`draftErrorMessage` + the new booking mapper → `transport-error.ts`); **new** for
the booking-specific reason mappers (no existing export covers these unions).

**Alternatives considered**: copy the mapper into booking-flow.ts (flagged-class
duplication); a message catalog keyed by string (loses union exhaustiveness — the
compile-time guarantee is the point).

## D7 — Money and expiry display: reuse the formatter; format expiry as local time

**Decision**: Every money value renders via the existing `formatMinorAmount`
(planner-form.ts — exact server minor units, locale pinned `en`). Pre-Write:
**reuse**. No client-side totals anywhere (FR-007; the plan total shown on screen
remains the draft's own `pricing.total`). Hold expiry renders via a new pure
`formatHoldExpiry(iso)` — `Intl.DateTimeFormat("en", { hour, minute, timeZoneName:
"short" })` in the viewer's zone, prefixed "Held until" — tests assert structure
("Held until" + non-empty time), never a wall-clock value.

**Rationale**: One money-rendering path repo-wide (SC-003); expiry is a timestamp,
not money — human-local display is the useful form for "act before it lapses"
(FR-003/INV-006 surfaced).

**Alternatives considered**: raw ISO strings (fails the premium bar); a live
countdown timer (ticking state complicates tests and adds no demo value at 10–30
minute sandbox hold windows — hotel 15m, activity 30m, transfer 10m, car 20m).

## D8 — Testing strategy: L1 helpers + L4 journey; the server gate is already L3

**Decision**: L1 Vitest unit tests for every booking-flow helper (markup mapping
bounds, all three mapping unions exhaustively, expiry formatting, metadata join)
under the existing `apps/web/lib/**/*.test.ts` include. L4 Playwright
`booking-journey.spec.ts` against the built compose image: self-serve sign-up →
draft the L3-proven trip (Paris, hardCap 1000 USD) → quote with default markup →
assert held rows (net, sell, markup, "Held until"), pending state observed → book
all → assert confirmation (status label, booking reference, per-component supplier
reference + price) → re-quote reports items as already booked → signed-out visitor
sees no booking control (FR-009). No new L2/L3: this feature changes zero server
code; the quote/book money path already carries 9 L3 tests against real Postgres
(spec 005 + seed-0015) which remain the authoritative integration gate, and the L4
journey exercises the full UI→tRPC→service→DB pipeline live (INV-027).

**Rationale**: Quality-bar L3 requirement reads "touching integration points" — the
integration point here (booking service ↔ DB ↔ sandbox) is untouched and already
L3-covered; the NEW integration (browser ↔ mounted router) is exactly what the L4
journey + live gate verify, mirroring the accepted spec 008 posture.

**Alternatives considered**: an L3 HTTP test driving `/api/trpc` booking procedures
(duplicates the existing L3 caller tests' coverage through a thinner assertion —
rejected as redundant); component tests via jsdom/RTL (new test infra for view
logic the L1 helpers + L4 journey already pin — YAGNI).

## D9 — Presentation: additive `.tf-booking-*` kit on the seed-0009s theme

**Decision**: Extend `apps/web/app/globals.css` with additive component classes
(`.tf-booking`, `.tf-quote-table`, `.tf-hold`, `.tf-confirmation`, state badges
reusing `--ok/--warn` tints) consistent with the planner's `.tf-draft`/`.tf-fit-table`
look; stable accessible names for the actions — quote button **"Quote live
prices"** (pending **"Quoting…"**), book button **"Book selected items"** (pending
**"Booking…"**); review region `data-testid="quote-review"`, confirmation region
`data-testid="booking-confirmation"`.

**Rationale**: seed-0009s sets the premium bar ("no bare pages") and the operator
memory pins it; test-relied selectors are frozen in the contract (spec 008
precedent) so theme polish can iterate without breaking e2e/UAT.

**Alternatives considered**: a component library (new dependency, off-theme); bare
HTML (violates the operator's premium bar and FR-010).

## D10 — Booked-state truth: always the platform's response, never inferred

**Decision**: The UI marks items booked/consumed/expired only from server
responses: the book outcome's per-component values, and re-quote responses
reporting `already_booked`. After a concluded booking the confirmation panel stays
on screen (INV-016) with the quote controls re-enabled; the review list is replaced
by the confirmation (which itself lists every component outcome with reasons —
FR-008's "review state with failed components' reasons"), and a fresh quote
restores the review list from the new server response.

**Rationale**: FR-008 forbids client-inferred booking state; the platform's
item-level exclusivity (spec-gap-0002/FR-016 server-side) is the guarantee, the UI
just renders it. Keeps the client stateless with respect to money truth (INV-028
mindset applied to the browser).

**Alternatives considered**: client-side "booked" bookkeeping across re-quotes
(drifts from server truth under concurrency — exactly what the backend's typed
outcomes exist to prevent).
