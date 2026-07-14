# Quickstart: Discover / "What's Hot" Feed

## Prerequisites

- Repo dependencies installed (`pnpm install`, run inside the build image per this repo's verified recipe).
- A running compose stack (`docker compose up --build --wait`) with a signed-in, verified agent account (any agency created via `/sign-up`).

## Automated validation

```bash
pnpm test                 # L1: apps/web/lib/__tests__/discover-feed.test.ts (data-shape rules from data-model.md)
npx playwright test tests/e2e/discover-journey.spec.ts   # e2e: pick destination -> feed renders -> Plan this -> builder pre-seeded
```

Expected: all tests pass; the e2e spec asserts (a) the Discover page renders a populated feed (not the old "coming soon" placeholder) after picking a featured destination, and (b) navigating from a feed item's "Plan this" action lands on `/workspace` with the destination input already containing that item's `planDestination` value.

## Manual validation (browser)

1. Sign in as a verified agent (existing demo/dev account, or one created via `/sign-up`).
2. Open the sidebar → **Discover**.
3. Pick a featured destination (e.g. Lisbon).
4. Confirm: a scrollable feed of at least 3 cards renders, each with a real photo, a blurb, and a hotel highlight — no "coming soon" placeholder text.
5. Switch to a different destination (e.g. Tokyo) and confirm the feed's contents fully replace the Lisbon items (no stale cross-destination items).
6. On any feed card, click **Plan this**.
7. Confirm: the AI Builder page opens with the Destination field already filled in with that card's destination (e.g. `Lisbon, Portugal`) — no manual typing required to continue.
8. Confirm the rest of the builder form (dates, party size, budget, currency) still shows its normal defaults — pre-seeding only touched the destination field.

## What this validates against the spec

| Spec item | Validated by |
|---|---|
| SC-001 (2 interactions to a populated feed) | Manual steps 2–4 |
| SC-002 (1 interaction from item to pre-filled builder) | Manual steps 6–7 |
| SC-003 (100% attributed real imagery) | `discover-feed.test.ts` data-shape assertions |
| SC-004 (≥3 items per destination) | `discover-feed.test.ts` data-shape assertions |
| FR-006 (same access guard) | e2e spec's unauthenticated/unverified-agent case |
| FR-009 (destination switch replaces content) | Manual step 5 / e2e assertion |
