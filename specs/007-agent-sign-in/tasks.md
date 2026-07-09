# Tasks: Agent Sign-In / Session-Establishment UI

**Input**: Design documents from `specs/007-agent-sign-in/` (plan.md, research.md D1–D9, data-model.md, contracts/session-establishment.md, quickstart.md)

**Tests**: included — the spec's acceptance criteria demand live e2e witnesses (FR-009/INV-027) and research D9 defines the test strategy. Repo policy (quality bar) makes integration-point tests mandatory.

**Organization**: grouped by user story; US1 = sign-in (P1, MVP), US2 = self-serve sign-up (P2), US3 = sign-out (P3).

## Phase 1: Setup

*No project-init tasks — the feature lands entirely inside the existing `apps/web` + `packages/db` layout. (Intentionally empty.)*

## Phase 2: Foundational (blocking prerequisites for all stories)

- [X] T001 [P] Add `getPrimaryMembership(db, userId)` (oldest membership by `createdAt`, per data-model.md) and `getOrganizationName(db, organizationId)` to `packages/db/src/membership.ts`, following the file's existing encapsulation comment (ORM predicates stay in packages/db)
- [X] T002 Export both helpers from `packages/db/src/index.ts` (public-surface addition per contracts §4)
- [X] T003 [P] Add env-gated L3 tests in `packages/db/src/__tests__/membership.test.ts` (real Postgres via `DATABASE_URL`, same gating pattern as existing L3 suites): no membership → `undefined`; one membership → that org; two memberships → oldest wins; `getOrganizationName` round-trip
- [X] T004 [P] Create `apps/web/lib/auth-client.ts` — `createAuthClient` from `better-auth/react` with `organizationClient()` plugin (research D3; no new dependency)
- [X] T005 Wire research D1 into `apps/web/lib/auth.ts`: `databaseHooks.session.create.before` sets `activeOrganizationId` from `getPrimaryMembership` (leave unset when the user has no membership); keep `getSessionContext` byte-identical (INV-023 ladder untouched)

**Checkpoint**: session auto-activation exists server-side; client plumbing ready. No UI yet.

## Phase 3: User Story 1 — Returning agent signs in and reaches the workspace (P1) 🎯 MVP

**Goal**: browser sign-in with email+password lands an agent in a workspace that greets them by name (user, agency, role — never raw IDs).

**Independent test**: seed an account+membership (script or prior sign-up), sign in through the browser, verify named greeting + agent-gated procedure success; wrong password refused with human-readable error.

- [X] T006 [P] [US1] Create `apps/web/app/(workspace)/sign-in/sign-in-form.tsx` (client component): email+password form driving `authClient.signIn.email`; on success `router.push("/workspace")` + refresh; any failure → inline "Invalid email or password." and no navigation (FR-004, research D8); client-side required/minLength validation (spec edge case)
- [X] T007 [US1] Create `apps/web/app/(workspace)/sign-in/page.tsx` (server component): `redirect("/workspace")` when the visitor already has an agent session (research D7); otherwise render the form + link to `/sign-up`
- [X] T008 [US1] Rewrite the greeting in `apps/web/app/(workspace)/workspace/page.tsx`: resolve user display name from the Better Auth session and agency name via `getOrganizationName`; render `name · agency name · role` with NO raw `userId`/`agencyId` (FR-006/IMP-2); non-agent branch keeps the literal text "agency membership" (pinned by smoke.spec) and adds a link to `/sign-in`
- [X] T009 [P] [US1] Add a `/sign-in` link to the root landing page `apps/web/app/page.tsx` (contracts §1)

**Checkpoint**: US1 independently deliverable (accounts seeded out-of-band can sign in and see the named greeting).

## Phase 4: User Story 2 — New agency owner signs up self-serve (P2)

**Goal**: one browser journey creates account + agency, leaves the user signed in as owner in the workspace.

**Independent test**: from a clean browser, sign up with a fresh email + agency name → workspace greets the new owner by name; duplicate email → clear error, no duplicate account.

- [X] T010 [P] [US2] Create `apps/web/app/(workspace)/sign-up/sign-up-form.tsx` (client component): name/email/password/agency-name form; flow per research D2 — `signUp.email` → `organization.create` (slug = slugified name + random suffix) → `organization.setActive` → `router.push("/workspace")`; duplicate-email and step failures surface human-readable errors (FR-004)
- [X] T011 [US2] Create `apps/web/app/(workspace)/sign-up/page.tsx` (server component): agent-session redirect (research D7) + render form + link to `/sign-in`

**Checkpoint**: full self-serve onboarding works end-to-end in the browser.

## Phase 5: User Story 3 — Signing out ends the session (P3)

**Goal**: a signed-in user can end their session from the workspace; the ladder reverts.

**Independent test**: sign in, sign out, verify `/workspace` shows the membership prompt again.

- [X] T012 [P] [US3] Create `apps/web/app/(workspace)/workspace/sign-out-button.tsx` (client component): `authClient.signOut()` then `router.push("/sign-in")` + refresh (research D6)
- [X] T013 [US3] Render the sign-out button on the agent branch of `apps/web/app/(workspace)/workspace/page.tsx` (FR-007)

## Phase 6: Polish & verification

- [X] T014 Write `tests/e2e/sign-in.spec.ts` (research D9): journey — sign-up with per-run unique email → workspace greeting shows name/agency/role and does NOT show raw IDs → sign out → sign in again (proves the D1 hook activates the agency on a fresh session) → workspace; plus wrong-password negative (stays on `/sign-in`, sees "Invalid email or password.", `/workspace` still prompts). MUST NOT weaken any existing spec; `/view` and anonymous-workspace negatives stay untouched
- [X] T015 Run deterministic gates and fix failures: `pnpm run lint`, `pnpm test` (in-image where host pnpm is denied), `tsc --noEmit` per package touched
- [X] T016 Live Test & Fix per INV-027 (quickstart.md): `docker compose down -v && docker compose up --build --wait` → `node tests/integration/smoke.mjs` → `npx playwright test` → Playwright-MCP QA journey with per-step screenshots into `.kitchenloop/evidence/iter-3/seed-0008/` → compose-log scan (no non-allowlisted ERROR/FATAL/Unhandled) → teardown

## Dependencies & execution order

- Phase 2 blocks everything: T001 → {T002, T003}; T004, T005 (T005 needs T001/T002)
- US1 (T006–T009): T006/T009 parallel; T007 after T006; T008 after T001/T002
- US2 (T010–T011): after Phase 2 (T004); independent of US1 code but the e2e journey uses both
- US3 (T012–T013): T012 parallel anytime after T004; T013 after T008
- Polish: T014 after all stories; T015–T016 last

**Parallel opportunities**: T001+T004 | T003+T006+T009+T010+T012 (different files) | US2 and US3 phases can interleave with US1 once Phase 2 lands.

**MVP scope**: Phase 2 + US1 (T001–T009) — sign-in against seeded accounts with the named greeting. US2/US3 complete the session lifecycle in the same PR (ticket acceptance needs the self-serve path for live verification without out-of-band seeding).
