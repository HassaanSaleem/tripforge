# Quickstart: Workspace AI Itinerary Planner UI

**Feature**: specs/008-planner-workspace-ui | **Date**: 2026-07-09

Validation guide — proves the feature end-to-end against the built stack
(INV-027). No API key required: a keyless compose stack runs the deterministic
planner fake (INV-019) and drafts in milliseconds with the title
`<Destination> <style> trip`. If the stack env carries `ANTHROPIC_API_KEY`
(the operator's local `.env` does), drafting runs the REAL Haiku tool loop
(INV-013) instead: expect a 10–20 s wait per draft, planner-authored titles
and day-splits that vary run to run, and the occasional typed
`planner_failed` outcome (surfaced as a human-readable message with retry —
that is US2 behaving correctly, not a defect). Every check below holds under
either planner.

## Prerequisites

- Docker daemon running; ports 3000 (web), 5432 (postgres), 8025 (mailpit) free.
- Repo checked out at this feature's branch.

## 1. Unit + lint gates

```bash
pnpm run lint          # ESLint — zero errors expected
pnpm test              # Vitest — includes the new apps/web/lib planner helpers
```

(Loop note: if host pnpm is denied, run both inside the built image — see
`.kitchenloop` memory recipe.)

## 2. Boot the built stack

```bash
docker compose down -v && docker compose up --build --wait   # exits 0, all services healthy
node tests/integration/smoke.mjs                             # L3 smoke green
```

## 3. Browser journey (US1 happy path)

1. Open `http://localhost:3000/sign-up` → create an account + agency (any name,
   e.g. `Nomad Trails / nomad-trails`), password ≥ 8 chars.
2. You land signed in; open `http://localhost:3000/workspace`.
3. Expect the greeting (name · agency · role) **and** the trip form (contract §2.1).
4. Fill: Destination `Lisbon`; Check-in `2026-09-07`; Check-out `2026-09-10`;
   Adults `2`; Children `0`; Trip style `balanced`; Budget `2500`; Mode
   `hardCap`; Currency `EUR`. Submit **Draft itinerary**.
5. Expect the button to read "Drafting…" (disabled), then a rendered draft:
   an itinerary title (exact wording varies under the real planner), day
   headings with priced items (`… EUR` amounts), and the budget summary table
   with per-category allocated/planned/state plus the total.

## 4. Failure feedback (US2)

1. Same form, set Budget to `1` (EUR), submit.
2. Expect a human-readable failure message — "No bookable options fit this
   trip and budget…" (every proposal is dropped as over-budget →
   `planner_failed`/`no_proposals`; under the real planner "The planner could
   not produce a usable plan this time…" may appear instead) — no raw error,
   form values retained.

## 5. Non-agent guardrail (US3)

1. Sign out (workspace button) → open `http://localhost:3000/workspace`.
2. Expect the membership prompt (sign-in / sign-up), **no trip form**.

## 6. Automated e2e + log scan

```bash
npx playwright test tests/e2e/planner-journey.spec.ts   # new journey spec
npx playwright test                                     # full suite stays green
docker compose logs --no-color | grep -E "ERROR|FATAL|Unhandled"   # only allowlisted lines
docker compose down -v
```

## Expected outcomes summary

| Check | Expectation |
|-------|-------------|
| `pnpm test` | green, including `apps/web/lib/__tests__/planner-form.test.ts` |
| Browser US1 | rendered draft: title, days, priced items, budget-fit table |
| Browser US2 | one human-readable failure message; form editable |
| Browser US3 | membership prompt only — no planner form |
| Compose log scan | no non-allowlisted ERROR/FATAL/Unhandled lines |
