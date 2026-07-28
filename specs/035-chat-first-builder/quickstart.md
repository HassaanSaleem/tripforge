# Quickstart / Validation: Chat-First, Multi-Turn Build-to-Book

Validates spec 035 against the BUILT compose image (INV-027). Keyless FakeLLM mode is deterministic, so these steps reproduce exactly.

## Prerequisites

```bash
docker compose down -v && docker compose up --build --wait
```

Sign up a fresh agency (any name/email) → you land on the dashboard → open the **AI Builder** (`/workspace`).

## Scenario A — Multi-turn chat builds a trip and offers to proceed (US1, SC-001)

1. On the idle builder, the **chat entry is the primary surface** (`data-testid="chat-entry"`); the structured form is NOT shown (a "Prefer a guided form?" toggle is).
2. Send: `Plan a trip to Lisbon` → assistant replies asking for a **budget** (destination known, budget missing). No draft. (FR-003)
3. Send: `around 2000 EUR for 4 nights, 2 people` → assistant now has enough: it shows a **confirmation summarising the trip** and a **"Build my trip"** action. (FR-001/FR-002)
4. Click **Build my trip** → the **compare view** (`data-testid="compare-options"`) renders 1–3 live-priced options — identical in shape to the form path, with zero form fields filled. (FR-004)
5. Choose an option → `data-testid="draft-result"` renders; the booking flow + share + refine chat appear exactly as via the form. (FR-004)

**Expected**: reached a booked-ready draft using only chat, across ≥2 turns.

## Scenario B — Chat is primary; form behind a toggle; Discover lands in form mode (US2)

1. Idle builder (no `?destination=`): chat primary, form hidden until the toggle.
2. Click **Prefer a guided form?** → the structured form appears (Destination/Check-in/…/Draft itinerary); a toggle back to chat is shown. Form behaves as today. (FR-005)
3. Navigate to `/workspace?destination=Lisbon,%20Portugal` (the Discover "Plan this" hand-off): the builder opens **in form mode** with **Destination pre-filled** and all other fields defaulted (Adults 2, Children 0, Budget empty, Currency EUR). (FR-006)

## Scenario C — Form path unchanged incl. failure survival + keyless determinism (US3)

1. In form mode, fill the form and draft → compare → choose → book: identical to before this feature. (FR-007)
2. In form mode, set an infeasible budget (e.g. 1 EUR) and draft → one human-readable failure message; the form (with values) survives. (FR-007)
3. Keyless determinism: the same two-turn conversation from Scenario A, submitted twice, resolves to the identical trip request (Lisbon, 4 nights, 2 adults, EUR 2000) — proven deterministically by the L3 suite. (FR-009/SC-004)

## Automated coverage

- **L1/unit** (`packages/api`): `interpretChatTripRequest` accumulates across a `priorMessages` transcript — destination in turn 1 + budget in turn 2 ⇒ `resolved`; either still missing ⇒ `needsInfo`.
- **L3** (`packages/api/src/__tests__/l3-chat-first-entry.test.ts`, real Postgres): (a) RBAC ladder unchanged; (b) NEW — a multi-turn (`priorMessages`) request resolves and feeds the EXISTING draft pipeline end-to-end (chat→draft→book handoff); (c) single-message still resolves (back-compat); (d) still-incomplete conversation ⇒ `needsInfo`, zero side effects.
- **e2e** (`tests/e2e/chat-first-journey.spec.ts`, built image): multi-turn chat → "Build my trip" → compare → choose → draft-result, no form touched; plus the toggle reveals the form. `support.ts`/`planner-journey.spec.ts` updated to open the form via the toggle.

## Teardown

```bash
docker compose down -v
```
