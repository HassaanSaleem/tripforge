# Tasks: Traveler Home — the post-auth landing at `/view`

**Feature dir**: `specs/033-traveler-home/` · **Branch**: `kitchen/fix-goal-traveler-account-home`

Dependency-ordered. `[P]` = parallelizable (touches a different file). No server/schema tasks — this
feature adds no procedure and no migration.

## Phase A — Tests first (red)

- [ ] **T001** [P] Extend `tests/e2e/traveler-account-journey.spec.ts`: after a **token-less**
  sign-up, assert the traveler lands on `/view` (not the old placeholder), the home greets by name,
  a **My Trips** link is present and navigates to `/view/my-trips`, and **Plan a trip** / **Discover**
  render as coming-soon (non-link). Assert the signed-in home shows no `TripForge`/`Trellis` and no
  "Agency workspace" link (INV-020/024 on the *signed-in* home). Assert **Sign out** returns to the
  anonymous `/view` welcome. (FR-001..FR-004, FR-006)
- [ ] **T002** Confirm `tests/e2e/smoke.spec.ts` + `tests/e2e/trust-boundary.spec.ts` still assert
  the anonymous `/view` heading `/Your trip/i` + INV-020/024 negatives — the new anonymous welcome
  MUST keep them green **unmodified** (FR-005, FR-006). (Verification task; do not weaken.)

## Phase B — Implementation (green)

- [ ] **T003** Add the sign-out client component `apps/web/app/(client-view)/view/traveler-home.tsx`
  (`"use client"`): a `TravelerSignOut` button calling the existing `signOut()` then
  `router.push("/view"); router.refresh()`. (FR-004; Pre-Write: new — see research D5)
- [ ] **T004** Rewrite `apps/web/app/(client-view)/view/page.tsx` (`force-dynamic`) to branch on
  `getSessionContext(headers)`:
  - anonymous ⇒ brand-neutral welcome (`data-plain tf-client-root`), heading contains "Your trip",
    Sign in / Create an account CTAs, **no** `clientView.*` call (FR-005/FR-006);
  - signed in ⇒ read `clientView.me` + `clientView.myTrips` via `getAuthenticatedCaller`, render the
    premium home: greeting (name or generic), My Trips card (count + link), Plan-a-trip &
    Discover coming-soon cards, `TravelerSignOut` (FR-001/002/003/006/007).
- [ ] **T005** [P] Add any needed `.tf-*` home classes to `apps/web/app/globals.css` (reuse
  `.tf-card`, `.tf-btn--cta`, `.tf-client-*`, `.tf-eyebrow` first; add a small `.tf-home-*` grid
  only if reuse is insufficient — do NOT fork per-page styles). (GOAL Deliverable 5 alignment)

## Phase C — Verify

- [ ] **T006** `pnpm run lint` and `pnpm test` green (in-image). INV-023 L3
  (`l3-traveler-accounts.test.ts`) still passes unmodified (FR-007, SC-004).
- [ ] **T007** Playwright: `traveler-account-journey`, `smoke`, `trust-boundary` green
  (SC-002/SC-003).
- [ ] **T008** INV-027 Live Test & Fix: run `quickstart.md` §1–3 in a real browser against the
  built compose stack, screenshot each step, scan compose logs. Fix any defect in-cycle.
- [ ] **T009** UAT gate: write the sealed card, spawn the zero-context `uat-evaluator`, adjudicate.

## Notes
- No `packages/*` changes. No `workspace.*` procedure touched. No money path, no schema, no
  migration (Constitution Check PASS in plan.md).
- Out of scope (other tickets): the My Trips list UI + its empty-state nav
  (`my-trips-empty-state-nav`), the real consumer planner (goal-consumer-planner), the What's Hot
  feed (goal-consumer-whats-hot). The home only signposts the latter two as coming soon.
