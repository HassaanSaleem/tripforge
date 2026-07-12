# Quickstart: Validating Streamed Draft Responses

**Feature**: specs/016-stream-draft-response

## Prerequisites

- Docker running; ports 3000/5432/8025 free.
- Keyless is fine for most checks: empty `ANTHROPIC_API_KEY` → deterministic
  FakeLLM planner still exercises the full progress-event pipeline (research
  R2 — the fake now emits the same event shape as the live path).

## 1. Boot the built stack

```bash
docker compose down -v && docker compose up --build --wait
```

## 2. Deterministic suites (in the built image)

```bash
docker build -f apps/web/Dockerfile --target build -t tripforge-verify .
docker run --rm tripforge-verify pnpm run lint
docker run --rm --network tripforge_default \
  -e DATABASE_URL=postgres://tripforge:tripforge@postgres:5432/tripforge \
  tripforge-verify pnpm test
```

Expect: `packages/llm` planner tests assert the progress-event sequence for
both `AnthropicLLM` (mocked tool-loop messages) and `FakeLLM`; the API-layer
draft test drives the subscription and asserts an unchanged terminal
`DraftOutcome`; the infeasible-budget case asserts zero progress events.

## 3. E2E specs

```bash
node /Users/hassansaleem/Desktop/tripforge/node_modules/@playwright/test/cli.js test
```

## 4. Live browser validation

1. `http://localhost:3000` → sign up an agency.
2. Open the workspace planner, fill in a valid trip request, submit.
3. **Expect**: the drafting status text changes at least once (e.g.
   "Searching hotels…" → "Assembling your itinerary…") before the finished
   itinerary renders — not a single static "Designing your trip…" message
   for the whole request.
4. **Expect**: the finished itinerary (title, days, budget-fit table) is
   pixel-for-content identical to a draft taken before this feature —
   compare against a pre-feature screenshot or the existing e2e assertions.
5. Network trace (DevTools → Network → the `/api/trpc` draft request):
   confirm the response `Content-Type` is `text/event-stream` and that
   multiple frames arrive over time rather than one frame at the very end.

## 5. Failure-path check (persistence contract, FR-004)

1. Submit a trip request with a budget below the flights reserve (forces
   `status: "infeasible"`) — expect the failure message to appear with no
   intermediate progress flicker (zero progress events, straight to the
   terminal event), and confirm via
   `docker compose exec postgres psql -U tripforge -c "SELECT count(*) FROM itinerary;"`
   that no new row was written for the attempt.
2. (Live-LLM only, if `ANTHROPIC_API_KEY` is set for this check) Force a
   planner failure and confirm the same: failure message shown, no
   itinerary row, no `trip_created` PMF event recorded.
