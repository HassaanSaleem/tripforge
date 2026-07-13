# Quickstart: Validating the Planner UX Redesign

## Prerequisites

- Repo dependencies installed (`pnpm install`, already satisfied in CI/dev images)
- No API key required — the FakeLLM keyless path drives the demo (per `keyless-demo-fakellm` convention): boot with `ANTHROPIC_API_KEY` unset/empty

## 1. Unit-level validation (fast, no browser)

```bash
pnpm test
```

Expected: all existing `apps/web/lib/__tests__/planner-form.test.ts` assertions still pass unmodified (proves FR-009/FR-010 — the request-mapping and failure-message contracts are untouched), plus new assertions for:
- `BUDGET_MODE_LABELS` / `TRIP_STYLE_LABELS` cover every enum value with a non-raw-enum string
- `HERO_DESTINATIONS` contains at least the four spec-required destinations
- `resolveDestinationTreatment` returns a match for a seeded destination string and a default for an unmatched one, and never throws

## 2. Live browser validation (built stack)

```bash
docker compose down -v && docker compose up --build --wait
node tests/integration/smoke.mjs
npx playwright test
```

Then, driving `http://localhost:3000` in a real browser (or Playwright MCP) as an agent:

1. Sign in with an agency account, open the workspace planner.
2. Confirm the budget-mode control shows only "Hard cap" / "Target budget" (inspect the DOM: no `hardCap`/`target` text anywhere).
3. Confirm the trip-style control shows only human labels (no `balanced`/`budget`/`premium` raw text).
4. Click the destination field; confirm a picker panel appears with at least Lisbon, Tokyo, Marrakech, Reykjavik, each visually distinct (flag + gradient swatch).
5. Select "Lisbon, Portugal" from the picker; confirm the field now reads `Lisbon, Portugal`.
6. Clear the field and type a destination not in the seeded list (e.g. `Ljubljana`); confirm it is still accepted as plain free text.
7. Fill in the remaining required fields (dates, party size, budget, currency) and submit.
8. Confirm the drafted result renders as a single hero card (image-forward header, day timeline, budget breakdown) — not the old plain table — and that the total price, budget-fit rows, and day content match what the server returned (cross-check against the `budget-fit` table's category/allocated/planned/state values, unchanged from before the redesign).
9. Submit a second draft; confirm the previous hero card is fully replaced (no stale content).
10. Trigger a known failure path (e.g. a budget below the flights reserve) and confirm the existing failure message text renders unchanged, with no hero card shown.

```bash
docker compose logs --no-color   # scan for ERROR|FATAL|Unhandled beyond the documented allowlist
docker compose down -v
```

## Expected outcome

- Zero raw enum identifier strings visible anywhere in the planner UI.
- A working destination picker (seeded + free-text) that feeds the exact same `destination` string into the draft request as before.
- A premium hero card presentation of the drafted itinerary with unchanged underlying data.
- All existing planner-form tests green; no changes to `DraftInput`/`DraftOutput`, canonical itinerary schema, or budget math.
