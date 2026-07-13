# Quickstart: Multi-Option AI Itinerary Generation

## Prerequisites

- Built compose stack (keyless: `ANTHROPIC_API_KEY=""` — deterministic
  FakeLLM path, no network required): `docker compose up --build --wait`
- A signed-in agent account with an agency membership (any seeded/created
  demo account).

## Validation scenario 1 — compare then select (US1 + US2)

1. Sign in, open the workspace planner.
2. Submit a trip request (destination, dates spanning 3+ days, party size,
   a budget generous enough to afford more than one hotel tier — e.g.
   Lisbon, 4 nights, 2 adults, target budget 3000 EUR).
3. **Expected**: 2-3 option cards render — "Budget-savvy", "Balanced",
   "Premium" — each showing a distinct total price and at least one
   distinct highlight (hotel name or activity count differs across cards).
4. Pick the "Balanced" card.
5. **Expected**: the builder view opens exactly as today's single-draft
   result — hero card, day-by-day plan, budget-fit table, booking controls,
   share control.
6. Open the agent's trip list.
7. **Expected**: exactly one new trip appears, matching the picked option's
   price/label — no trace of "Budget-savvy" or "Premium".

## Validation scenario 2 — determinism (US3)

1. With the compose stack still running keyless (no `ANTHROPIC_API_KEY`),
   submit the SAME trip request from scenario 1 a second time (a fresh
   comparison, do not select anything from the first run).
2. **Expected**: the 2-3 options rendered are identical in label, price, and
   highlights to the first run's options.

## Validation scenario 3 — infeasible trip (edge case)

1. Submit a trip request with a budget below the flights reserve (or a
   check-out date equal to check-in, if the form allows it).
2. **Expected**: no option cards render; the same infeasible-trip message the
   single-draft flow already shows today.

## Automated coverage pointers

- `packages/api/src/__tests__/l3-planner-verification.test.ts` — extend for:
  compare-time options are never persisted (assert zero DB rows / zero PMF
  events after a `draft` subscription completes); `selectDraft` persists
  exactly one row + one PMF event on success; re-verification failure at
  select time yields the same typed outcome as today's single-draft failure
  path (no partial write).
- `packages/llm` unit tests — FakeLLM produces 2-3 distinct, deterministic
  variants for a normal trip request, and degrades to fewer (never
  duplicate-looking) options for a constrained one.
- Playwright (`apps/web` L4/UAT journey) — drives scenario 1 end-to-end in a
  real browser.
