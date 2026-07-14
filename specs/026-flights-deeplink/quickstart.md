# Quickstart: Flights Card — Indicative Options + Deep-Link Handoff

## Prerequisites

- Built compose stack running (INV-027/ADR-0003 — never a dev server for
  verification): `docker compose up --build --wait`
- A signed-in, verified agent session (keyless FakeLLM demo path works —
  `ANTHROPIC_API_KEY` empty is sufficient; see `memory/keyless-demo-fakellm.md`
  precedent from prior iterations)

## Scenario 1 — Freshly-drafted trip shows the flights card (User Story 1)

1. Open the AI Builder (`/workspace`), submit a destination (e.g. "Lisbon"),
   dates, party size, budget → draft the trip.
2. On the drafted result, confirm a "Flights" card renders below/alongside
   the day-by-day itinerary, showing 2 or 3 options, each with an airline,
   indicative departure/return times, and an indicative price.
3. Confirm the card also shows the trip's allocated flights budget amount
   (e.g. "Your flights budget: $XXX") matching the `flightsTransport` row
   already shown in the existing "Budget summary" table on the same page.

**Expected**: options are non-empty, distinct-looking (not placeholder text),
prices are formatted like every other price on the page (`formatMinorAmount`
style, e.g. "$412.00").

## Scenario 2 — Deep-link handoff opens an external tab, no booking (User Story 2)

1. From the drafted result's flights card, click the "Search flights on
   partner ↗" action.
2. Confirm a new browser tab opens to an external URL (not `localhost:3000`
   or any TripForge route).
3. Return to the original tab; confirm the trip's itinerary, budget summary,
   and any booking state are byte-identical to before the click (no new
   network request to any `workspace.itinerary.*` or `workspace.booking.*`
   procedure — check the browser network panel/Playwright MCP
   `browser_network_requests`).

**Expected**: zero mutation requests fired; the external tab's URL contains
the trip's destination and dates.

## Scenario 3 — Reopened trip shows the same flights card (User Story 3)

1. From Scenario 1's drafted trip, navigate to `/trips`, then reopen that same
   trip from the list.
2. Confirm the flights card renders again, with the SAME options as in
   Scenario 1 (same airline names, same indicative times/price).

**Expected**: byte-identical option set to Scenario 1's — proves determinism
(spec SC-003) across the draft-time and reopen-time render paths.

## Automated verification

- **Unit (L1)**: `apps/web/lib/__tests__/flights.test.ts` —
  `indicativeFlightOptions`/`buildFlightSearchUrl` determinism, 2-3-option
  invariant, no-throw on empty/unusual destination strings.
- **e2e (L2/L4)**: extend the existing planner/trips Playwright spec with one
  assertion each for Scenario 1 (card renders with options) and Scenario 3
  (reopened trip shows the same options) — reuses the existing draft-a-trip
  helper (`tests/e2e/support.ts`), does not fork a new spec file.
- **Live Test & Fix (INV-027)**: manual/MCP browser journey covering all three
  scenarios above against the built compose image, screenshots archived to
  `.kitchenloop/evidence/6/demo-10-flights-deeplink/`.
