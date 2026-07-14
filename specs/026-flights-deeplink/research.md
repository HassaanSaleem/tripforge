# Phase 0 Research: Flights Card — Indicative Options + Deep-Link Handoff

## Decision: Where destination/dates come from (no schema change)

**Decision**: Read destination/checkIn/checkOut from the existing `tripRequest`
that is already threaded alongside every persisted itinerary, rather than
adding any field to the canonical `ItinerarySchema`.

**Rationale**: `packages/db/src/schema-itinerary.ts` already has a `trip_request`
jsonb column on the `itinerary` table, populated at draft time
(`packages/api/src/services/planner.ts`, `tripRequestSchema`) and already
returned by `workspace.itinerary.get` (`itineraryOverview` in
`packages/api/src/services/booking/overview.ts` returns `{ itinerary, tripRequest,
... }`). `apps/web/app/(workspace)/workspace/itinerary-list.tsx` (the reopened-trip
view) already receives this payload but does not currently destructure
`tripRequest` — a zero-backend-change, additive client read. For the
freshly-drafted view (`planner.tsx`), the "comparing" view-state phase already
threads a `DraftInput` (which includes destination/checkIn/checkOut) through as
`view.tripRequest`; the "drafted" phase currently drops it after firing the
`selectDraft` subscription. Carrying it into the "drafted" phase's view state
too (mirroring the existing pattern one phase later) is a small additive change
with no new query.

**Alternatives considered**:
- *Add `destination`/`dates` fields to the canonical `ItinerarySchema`* — rejected:
  triggers a schema version bump, which is an ALWAYS-HALT item per
  `DIRECTIVE.md` (ratified constitution/schema changes require an operator
  gate). Also unnecessary — the data already exists one join away.
- *Parse the destination out of `itinerary.title`* (e.g. "Lisbon City Break — 3
  Days/2 Nights") — rejected: fragile string-parsing of a human-facing title
  with no guaranteed format, when a structured `tripRequest.destination` value
  already exists server-side.
- *Add a new tRPC procedure to fetch trip request separately* — rejected:
  redundant network round-trip for data the existing `get` response already
  carries.

## Decision: Indicative option generation lives in `apps/web/lib`, not `packages/domain`

**Decision**: A pure function in `apps/web/lib/flights.ts`,
`indicativeFlightOptions(destination, checkIn, checkOut, currency)`, derives 2-3
options deterministically from a stable hash of the destination string (airline
name pool, indicative price band, rough departure/return time-of-day), using
`checkIn`/`checkOut` for the displayed dates. No randomness (`Math.random`),
no network call.

**Rationale**: Determinism is a hard requirement from spec SC-003 (same trip →
same options across draft-then-view and save-then-reopen) — matches the
project's existing sandbox-supply convention of deterministic fixtures keyed
off search criteria (Constitution V / INV-019 "zero paid services"). Placement
was reconsidered mid-research: `packages/domain` is never imported by
`apps/web` today (verified by grep — zero hits) — every piece of pure,
DOM-free client-view logic instead lives in `apps/web/lib/`, one file per
component, colocated with its consumer and unit-tested under
`apps/web/lib/__tests__/` (e.g. `planner-form.ts` reimplements its own
`formatMinorAmount` rather than importing `packages/domain`'s money
formatting; `basis-points.ts` is the closest style precedent — a small pure
percent/display conversion module with no I/O). Following that established
convention (CLAUDE.md: "study existing patterns closely") beats introducing a
new cross-package import path for a single feature. A `packages/domain`
module would also imply the value is itinerary/business-domain data flowing
through the server layer, which it is not — it never touches the canonical
schema or a database row.

**Alternatives considered**:
- *`packages/domain/src/flights.ts`, imported into `apps/web`* — rejected:
  would be the first-ever `apps/web` → `packages/domain` import in the repo,
  an architectural precedent this single low-priority ticket shouldn't set
  unilaterally; the existing `apps/web/lib/` convention already solves pure
  client-view logic without it.
- *New `packages/supply-adapter/src/sandbox/flight.ts` + `FlightPort`* —
  rejected: no caller will ever "book" through it (Non-goal), so the
  port/adapter/engine machinery (hold windows, offer verification, booking
  lifecycle) would be entirely unused ceremony.
- *Random (non-deterministic) generation* — rejected: violates spec SC-003 and
  User Story 1/3 acceptance scenarios (stable across re-render/reopen).

## Decision: Deep-link URL construction

**Decision**: Build a single generic flight-search URL (Google Flights search
query pattern, `https://www.google.com/travel/flights?q=...`) parameterized by
destination and dates only (no origin parameter — see spec Assumptions), also
generated inside `apps/web/lib/flights.ts` as a pure
`buildFlightSearchUrl(destination, checkIn, checkOut)` string-returning
function, next to `indicativeFlightOptions`. The UI opens it via a plain
`<a target="_blank" rel="noreferrer">`, the same pattern already used for
external media links in `itinerary-days.tsx`/`itinerary-list.tsx`
(`<a href={ref.url} target="_blank" rel="noreferrer">`).

**Rationale**: No commercial flight-search partner integration exists yet
(Assumption in spec.md); a generic, always-resolvable public search URL keeps
the deep-link real and clickable today without inventing a fake partner
endpoint. `target="_blank" rel="noreferrer"` matches the existing external-link
convention already used twice in this codebase (no new pattern introduced).

**Alternatives considered**:
- *Fabricate a fake `partner.example.com` URL* — rejected: acceptance scenario
  (User Story 2) requires activating the action to actually open an external
  site; a non-resolving placeholder would fail live/UAT verification.
- *Per-airline deep links (one per indicative option)* — rejected as v0 scope:
  ticket asks for "a 'Search flights' / 'Book on partner' deep-link button"
  (singular action on the card), not one link per option; keeps the card
  simple and matches FR-004 (single clearly-labeled action).

## Decision: No new tRPC procedure / contract

**Decision**: No new backend endpoint. The pure `apps/web/lib/flights.ts`
functions run entirely client-side, fed by data the client already has (see
prior decision on destination/dates sourcing).

**Rationale**: Avoiding a round trip means the flights card renders
synchronously with the rest of the drafted/reopened view — no extra loading
state to design or test, and no new server surface to secure/tenant-scope
(there is nothing tenant-specific in a seeded, destination-keyed value).

**Alternatives considered**:
- *tRPC query `workspace.itinerary.flights`* — rejected: adds a network
  round-trip and a new procedure/contract for a value that requires zero I/O
  to compute; against Development Workflow's simplicity default.
