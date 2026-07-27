# Quickstart / Validation Guide: Consumer AI Planner

## Prerequisites

- Compose stack built and booted: `docker compose down -v && docker compose up --build --wait`
- Keyless is fine (no `ANTHROPIC_API_KEY`) — the deterministic FakeLLM drives interpret + draft.
- A traveler account (sign up at `/view/sign-up`, no share token needed — spec 030).

## L1/L2/L3 (vitest)

```
pnpm test
```
Expected new/changed suites green:
- `packages/api/src/__tests__/l3-consumer-planner.test.ts` — interpret (resolved) → draft
  (1–3 live-priced options, each redacted: NO `netRate`/supplyRef) → `requestPlan` inserts one
  `consumer_plan_request` row; asserts NO `booking`/`markup_ledger`/`itinerary` row was written.
- `packages/api/src/__tests__/consumer-planner-rbac.test.ts` — a traveler session invoking the
  agent `workspace.itinerary.draft` procedure is refused FORBIDDEN (INV-024 negative).
- `client-view-projection.test.ts` — consumer draft options expose sell price only.

## Live smoke + e2e

```
node tests/integration/smoke.mjs
npx playwright test tests/e2e/consumer-planner-journey.spec.ts
```
`consumer-planner-journey.spec.ts` signs in as a traveler, opens `/view/plan`, sends
"Plan a trip to Lisbon", then "around EUR 2000 for 4 nights, 2 people", clicks **Build my
trip**, sees ≥1 live-priced option, picks one, chooses **Have an agent arrange & book this**,
submits a name, and sees a confirmation.

## Manual browser walkthrough (QA / UAT)

1. Sign in as a traveler at `/view/sign-in`; land on `/view`.
2. Confirm the persistent nav shows **Plan a trip** as a LIVE link (no "Soon" badge) and the
   home **Plan a trip** tile is an active link (not the greyed "coming soon" card).
3. Open **Plan a trip** → `/view/plan`. Send `Plan a trip to Lisbon`. The assistant asks for a
   budget. Send `around EUR 2000 for 4 nights, 2 people`.
4. A summary + **Build my trip** action appears. Click it → 1–3 options render, each with a
   trip total and a per-category breakdown. Confirm **only single sell prices** show (no "net"
   / "markup" anywhere).
5. Pick an option → the plan + a fork appears: **Have an agent arrange & book this for me** and
   **Book it myself**.
6. **Book it myself** → an honest note that self-drive booking runs on agent-prepared trips
   today + a path to request an agent. No booking fires.
7. **Have an agent arrange & book this** → name pre-filled from your account; submit → a
   confirmation ("An agent will be in touch"). A `consumer_plan_request` row now exists.
8. Try `/view/plan` while signed out → redirected to traveler sign-in, returned after auth.

## Negative checks

- No `ANTHROPIC_API_KEY` set → the flow still completes (keyless).
- Compose logs (`docker compose logs --no-color`) show no non-allowlisted ERROR/FATAL/Unhandled
  during the journey.
- DB after a journey: exactly one new `consumer_plan_request`, zero new `booking` /
  `booking_component` / `markup_ledger` / `itinerary` rows attributable to the planner.
