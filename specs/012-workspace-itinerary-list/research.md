# Research: Workspace Itinerary List (spec 012)

All Technical Context unknowns resolved. Decisions numbered for citation from
code comments and the PR body.

## D1 — Data source: reuse the two existing procedures, add none

**Decision**: The panel drives `workspace.itinerary.list` (list) and
`workspace.itinerary.get` (open) through the typed browser tRPC client.
No new or modified server procedures, services, or DB queries.

**Rationale**: `listItineraries` (packages/api/src/services/itineraries.ts)
is exactly the required projection — tenant-scoped (INV-004), newest-first,
id/title/currency/createdAt — and is L3-proven against real Postgres
(l3-itinerary-list.test.ts, PR #27). `itineraryOverview` returns the
canonical document plus quote/booking summaries, already L3-covered for
expiry filtering, consumed marking, and cross-tenant NOT_FOUND
(l3-booking.test.ts). The ticket states it: missing UI panel, not missing
API.

**Alternatives considered**: a bespoke list+detail endpoint (rejected —
duplicates a proven read; violates simplicity default); server-component
data fetching in page.tsx (rejected — the workspace page is a session-gated
server component but the panel needs client-side refresh after draft, and
the sibling panels all follow the client-component + tRPC pattern of spec
008/009/011).

## D2 — Draft-freshness: client wrapper with a refresh signal; additive Planner callback

**Decision**: New client component `WorkspacePanels` composes
`<Planner onDrafted={bump} />` and `<ItineraryList refreshToken={n} />`.
`Planner` gains one OPTIONAL prop `onDrafted?: () => void`, invoked exactly
when a draft mutation resolves with `status: "drafted"`. The list panel
re-runs its load effect when `refreshToken` changes. `page.tsx` swaps
`<Planner />` for `<WorkspacePanels />` — the server component keeps gating
who sees the panels (INV-024), unchanged.

**Rationale**: FR-006 is the seed-0016 staleness lesson (picker said
"Nothing to list yet" against a fresh license receipt) applied to the new
surface: sibling client components can't observe each other, so the parent
owns the freshness signal. Plain lifted state is the established React
idiom; the Planner change is additive and backward-compatible (all existing
tests/compositions unaffected).

**Alternatives considered**: DOM CustomEvent bus (rejected — untyped,
invisible to tests, non-idiomatic); polling/refetch interval (rejected —
wasteful, still stale between ticks); Next.js router.refresh()/server
revalidation (rejected — the page is force-dynamic but the panel state is
client-side; a full refresh would also reset the planner's drafted view,
destroying the agent's working context).

## D3 — Open in place, not a new route

**Decision**: Opening a listed itinerary renders the detail view inside the
panel (client state: `{phase: opened, itineraryId}` → `get` query → day-by-day
plus booking/share), with a "Back to trips" affordance. No
`/workspace/itinerary/[id]` route in this version.

**Rationale**: Matches spec 009 research D2's placement logic — booking
controls stay structurally inside a verified agent's workspace surface; one
page keeps the INV-024 gate composition unchanged and adds no new route to
gate. Deep-linking to a trip is not a spec requirement (SC-001 needs ≤2
interactions from the workspace, satisfied); a route page becomes worthwhile
only when something needs to link INTO a trip (e.g. seed-0018 lineage
navigation) and can be added then without rework — the view component is
route-agnostic.

**Alternatives considered**: dynamic route `/workspace/itinerary/[id]`
(rejected for v0 — extra gated route, session plumbing, and loading states
for a journey the panel already serves in ≤2 clicks).

## D4 — Continue-work reuses BookingFlow + ShareControl; type via router inference

**Decision**: The opened view composes the EXISTING `BookingFlow` (props:
`itinerary: DraftedItinerary`) and `ShareControl` (props: `itineraryId`)
unchanged. `lib/trpc/client.ts` gains
`export type GetItineraryOutput = inferRouterOutputs<AppRouter>["workspace"]["itinerary"]["get"]`;
the found-outcome's `itinerary` field is the same canonical wire shape as
`DraftedItinerary` (both are the canonical `Itinerary` type serialized over
the same tRPC surface), so the composition type-checks without casts. If a
structural mismatch ever appears it is a compile error, not a runtime risk.

**Rationale**: Spec 009 FR-009's guarantee is that non-agents never see
booking controls — the opened view renders only inside the workspace page's
verified-agent gate, and every read/mutation behind it is `agentProcedure`
(INV-023), so the guarantee is preserved structurally in the second location.
Spec 009 research D2 rejected a reload surface as "explicitly out of scope"
at the time — spec 012 is exactly that surface arriving through SDD, not a
silent contradiction. Rebuilding booking/share UI would duplicate a
money-path surface (review-blocking near-duplicate).

**Alternatives considered**: read-only detail view without booking/share
(rejected — fails the ticket's "continue work" expected behavior and
FR-005); a shared abstraction wrapping both flows (rejected — YAGNI, two
compositions do not justify a layer).

## D5 — Extract `ItineraryDays` from `DraftResult` (generalize)

**Decision**: Move the day-by-day rendering (days loop, item rows with
`formatMinorAmount`, empty-day copy) from `planner.tsx`'s `DraftResult` into
a shared presentational component `itinerary-days.tsx`, consumed by both
`DraftResult` (unchanged output) and the opened view. The budget-fit table
STAYS in `DraftResult` — fit data exists only on the draft outcome.

**Rationale**: Extraction threshold (typescript-clean-architecture): 2 call
sites now share the shape. Copying the JSX into the new panel would be the
exact near-duplicate the Pre-Write discipline blocks.

**Alternatives considered**: rendering the opened document with new bespoke
markup (rejected — duplicate concept, visual drift between "just drafted"
and "reopened" views of the same trip).

## D6 — Created-date formatting: fixed-locale pure helper

**Decision**: `lib/itinerary-list.ts` exports
`formatCreatedDate(iso: string): string` using
`Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })`
(e.g. `9 Jul 2026`). L1-tested.

**Rationale**: FR-002 needs a human-readable date; pinning locale AND
timezone makes server/client/e2e rendering deterministic (no hydration
mismatch, no host-locale flakiness). `en-GB` short-month reads naturally in
travel copy and matches the existing formatter philosophy (formatMinorAmount
pins en-US for numbers).

**Alternatives considered**: browser default locale (rejected —
hydration-mismatch risk between server HTML and client render, flaky e2e
assertions); raw ISO string (rejected — fails "human-readable").

## D7 — Failure wording: reuse `transportErrorMessage`

**Decision**: List-load and open failures map through the existing
`transportErrorMessage(error, wording)` helper with panel-specific wording,
exported from `lib/itinerary-list.ts` (`listErrorMessage`,
`openErrorMessage`). No raw error text ever rendered (FR-008).

**Rationale**: Same helper the marketplace/booking/share panels use — one
transport-failure vocabulary across the workspace (reuse decision, D7 of
spec 011 precedent).

## D8 — No pagination, no search (v0)

**Decision**: Render all rows the server returns, newest first. Documented
spec assumption; revisit on real usage.

**Rationale**: P0 agencies hold small counts; `listItineraries` has no
cursor contract — inventing one client-side would be speculative. A
follow-up ticket is the right vehicle when needed.

## D9 — Styling: extend the `.tf-*` kit with a trips-list treatment

**Decision**: Add `.tf-triplist` (panel), `.tf-trip-row` (row: title,
currency badge, date, open affordance), and reuse existing kit atoms
(`.tf-card`, `.tf-eyebrow`, `.tf-badge`, `.tf-btn--ghost`, `.tf-market-empty`
class family for the empty state). No new design language.

**Rationale**: seed-0009s premium bar (FR-010) with kit consistency —
the marketplace grid treatment is card-per-listing (browse), while the
workspace list is row-per-trip (dense, scannable); a small dedicated class
set beats overloading `.tf-market-*` semantics.

## D10 — Licensed-copy freshness: fresh mount load + L3 pin

**Decision**: FR-007 is satisfied by the panel loading on every mount
(marketplace → workspace navigation remounts the page — `force-dynamic`
server component + client effect). No cross-page invalidation bus. The
integration truth ("the buyer's list contains the white-label copy after
licensing") is pinned by a new L3 assertion in `l3-itinerary-list.test.ts`:
agency A lists, agency B licenses, B's `workspace.itinerary.list` contains
the copy id from the license receipt (and A's does not grow).

**Rationale**: The staleness bug class (seed-0016) was same-page state; a
cross-page navigation always remounts. The L3 pin makes the UI's core
promise (spec SC-003 second half) a regression-oracle fact rather than an
e2e-only observation.
