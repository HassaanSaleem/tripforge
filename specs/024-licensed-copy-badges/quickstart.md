# Quickstart: Licensed-Copy & Resale Provenance Badges

## Prerequisites

- Built compose stack running (`docker compose up --build --wait`), `http://localhost:3000`.
- Three vetted demo agencies (the demo seed already provisions several vetted agencies) — or three
  fresh sign-ups + operator/seed vetting, matching the existing marketplace e2e fixture pattern.

## Scenario 1 — Reseller recognizes their own licensed copy (US1)

1. As Agency A, sign in, draft a trip, list it on the marketplace.
2. As Agency B, sign in, browse the marketplace, license A's listing.
3. Open the sell-form picker (`/marketplace`, "List a finished itinerary" section) — the licensed
   copy's option shows a licensed-copy marker naming Agency A as original author.
4. Open the workspace trip list (`/workspace`) — the same trip's row shows the same marker.
5. Confirm a self-authored, never-licensed trip in B's workspace shows NO such marker.

**Expected**: both surfaces mark the copy and name the original author; the self-authored trip is
unmarked.

## Scenario 2 — Buyer sees resale depth on the marketplace (US2)

1. Continuing from Scenario 1: as Agency B, re-list the licensed copy on the marketplace.
2. As Agency C, sign in, browse the marketplace.
3. B's re-listed card shows a "Resale · Gen 1" marker (or equivalent generation-1 wording).
4. As Agency C, license B's re-listed copy, then re-list it too.
5. As a fourth browsing agency (or A/B again), confirm C's card shows "Resale · Gen 2".
6. Confirm Agency A's original listing card shows no resale marker.

**Expected**: generation number matches lineage depth exactly; the original never carries a marker.

## Automated verification

- L1/L2: `pnpm test` — new projection tests in `packages/api`/`packages/marketplace`, new
  display-helper tests in `apps/web/lib/__tests__/`.
- e2e: `npx playwright test` — extends the existing marketplace-journey (or a sibling) spec to
  assert the picker option text, the workspace-list badge, and the cross-tenant browse-card badge
  through a real license → re-list → browse chain.
- Live Test & Fix: drive Scenario 1 and Scenario 2 above in a real browser against the built
  compose stack, screenshot each step, per INV-027.
