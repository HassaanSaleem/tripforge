---

description: "Task list for p2-consumer-accounts-identity (030-traveler-client-accounts)"
---

# Tasks: Traveler Client Accounts — Optional Sign-In on the Client View

**Input**: Design documents from `/specs/030-traveler-client-accounts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/traveler-accounts.md, quickstart.md

**Tests**: INCLUDED. This touches a trust-boundary integration point (a new `protectedProcedure`
mounted on the public client-view router) so an L3 test against real Postgres is mandatory per
the quality bar. Not a money path — no concurrency/conservation treatment required. Following
the established convention (`l3-trip-handoffs.test.ts`, `l3-client-view.test.ts`): one new L3
file (`l3-traveler-accounts.test.ts`) covers every user story's identity/isolation/regression
assertions; no separate unit-test file for the trivial primary-key read alone.

**Organization**: Tasks are grouped by user story (spec.md priorities P1/P2/P1) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US3)

## Path Conventions

Monorepo (pnpm + turborepo): `packages/db`, `packages/api`, `apps/web` — per plan.md's
Project Structure section. No new package.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Nothing new to initialize — this feature extends existing packages/apps with
their established tooling.

- [X] T001 Confirm `pnpm test`/`pnpm run lint` run clean on `origin/main` baseline before
  starting (sanity check, no new tooling needed)

**Checkpoint**: No blocking setup — proceed directly to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The identity-read plumbing every user story depends on. MUST complete before any
user story implementation. No schema change (data-model.md) — this phase is read-shape and
routing only.

- [X] T002 [P] Add `getUserIdentity(db, userId): Promise<{name, email} | undefined>` to
  `packages/db/src/membership.ts` (sibling to `getMemberRole`/`getPrimaryMembership`/
  `getOrganizationName` in the same file) and export it from `packages/db/src/index.ts`
- [X] T003 [P] Move `apps/web/app/(workspace)/auth-form.tsx` to `apps/web/lib/auth-form.tsx`
  (no content change beyond the file's own header comment noting the relocation reason); update
  the two existing imports in `apps/web/app/(workspace)/sign-in/sign-in-form.tsx` and
  `apps/web/app/(workspace)/sign-up/sign-up-form.tsx` from `../auth-form.js` to
  `../../../lib/auth-form.js`
- [X] T004 Add `TravelerIdentity` type (`{name: string; email: string}`) and
  `getSignedInIdentity(container, userId): Promise<TravelerIdentity | null>` to
  `packages/api/src/services/client-view.ts`, using the file's existing inline
  `const db = container.db; if (!db) throw new Error(...)` guard style (data-model.md,
  research D4) — depends on T002
- [X] T005 Add `me: protectedProcedure.query(({ctx}) => getSignedInIdentity(ctx.container,
  ctx.session.userId))` to `clientViewRouter` in `packages/api/src/routers/client-view.ts`
  (contracts §1) — depends on T004
- [X] T006 [P] Export `TravelerIdentity` from `packages/api/src/index.ts` (TS4023 convention,
  alongside `ClientItineraryView`) — depends on T004
- [X] T007 [P] Add `getAuthenticatedCaller(headers: Headers)` to `apps/web/lib/trpc/server.ts`:
  `createAppCaller(await createTrpcContext(headers))` (research D3)
- [X] T008 [P] ~~Export `ClientViewMeOutput` via router-inference~~ — SKIPPED as redundant: T006
  already exports `TravelerIdentity` directly from `@tripforge/api` (matching the precedent
  `ClientItineraryView`/`ClientViewItem` already use — those are also directly exported and
  imported by name in `page.tsx`, not via router-inference). `clientView.me`'s return type IS
  `TravelerIdentity | null`, so a second inferred type would just duplicate it.

**Checkpoint**: `clientView.me` is live and independently callable (anonymous → UNAUTHORIZED,
signed-in → own identity). User story implementation can now begin.

---

## Phase 3: User Story 1 - A returning traveler's request form fills itself in (Priority: P1) 🎯 MVP-core

**Goal**: A signed-in traveler opening the request-an-agent form on ANY shared trip sees their
name/email pre-filled, still editable, still able to submit an anonymous-shaped record.

**Independent Test**: Seed/sign in a traveler with a known name/email, open a shared trip link,
select "Have an agent arrange this for me," verify the fields render pre-filled and editable,
and that submitting with an edited name persists the EDITED value, not the account name.

### Tests for User Story 1

- [X] T009 [US1] Create `packages/api/src/__tests__/l3-traveler-accounts.test.ts` with the US1
  walk against real Postgres: `callerFor(null).clientView.me()` rejects `UNAUTHORIZED`; a
  traveler session (`{userId}` with a matching `user` row inserted directly, no `member` row,
  mirroring `l3-client-view.test.ts:151`'s traveler fixture) calling `clientView.me` gets back
  exactly its own `{name, email}`; a SECOND traveler's session never sees the first traveler's
  identity (cross-traveler isolation); a signed-in AGENT session's own `clientView.me` also
  succeeds and returns its own identity (FR-005)

### Implementation for User Story 1

- [X] T010 [US1] Create `apps/web/app/(client-view)/view/sign-in/page.tsx` (server component):
  read optional `?token=` search param + current session via `getSessionContext`; redirect to
  `/view/${token}` (or `/view` if no token) if already signed in; otherwise render
  `<ClientSignInForm returnTo={...} />` inside the brand-neutral client-view shell (contracts §2)
- [X] T011 [US1] Create
  `apps/web/app/(client-view)/view/sign-in/client-sign-in-form.tsx` (client component): reuses
  `CredentialsFields`/`useSubmitState` from `apps/web/lib/auth-form.js` (T003) and the EXISTING
  `signInWithEmail` from `apps/web/lib/auth-client.js` unchanged; on success `router.push(returnTo)`
  + `router.refresh()` (contracts §2)
- [X] T012 [US1] Edit `apps/web/app/(client-view)/view/[token]/page.tsx`: build an
  authenticated-or-anonymous caller via `getAuthenticatedCaller(await headers())` (T007), call
  `.clientView.me()` guarded against `UNAUTHORIZED` (catch → `null`), and pass the result as
  `identity` to `<TripFork token={token} identity={identity} />`; the existing
  `resolveView`/`clientView.itinerary` call is UNCHANGED (still via `getAnonymousCaller`, per
  research D3 — zero risk to the P1 regression-protected rendering path)
- [X] T013 [US1] Edit `apps/web/app/(client-view)/view/[token]/trip-fork.tsx`: accept an
  `identity: TravelerIdentity | null` prop; set `defaultValue={identity?.name ?? ""}` /
  `defaultValue={identity?.email ?? ""}` on the existing uncontrolled `contactName`/
  `contactEmail` inputs (research D6 — submit handler untouched); render a small strip in the
  initial (`choice === null`) fork state: signed out → a link to `/view/sign-in?token=${token}`
  ("Have an account? Sign in"), signed in → `Signed in as {identity.name} ·` + a "Sign out"
  button calling `signOut()` (reused from `auth-client.js`) then `router.refresh()`

**Checkpoint**: A traveler who is ALREADY signed in (seeded, or via US2 once it ships) sees a
pre-filled, editable request-agent form; sign-out reverts it. (No self-service sign-up yet —
that's US2.)

---

## Phase 4: User Story 2 - A traveler creates a lightweight account from the client view (Priority: P2)

**Goal**: A traveler with no account can create one (name/email/password) from the client-view
without ever being offered agency/organization creation, landing back signed in on the trip page
they started from.

**Independent Test**: From a shared trip page, open the sign-up form, submit valid credentials,
verify the traveler ends up signed in on the originating trip page with no agency-creation step
reachable anywhere in the flow and no resulting `member` row for the new user.

### Tests for User Story 2

- [X] T014 [US2] ~~Extend `l3-traveler-accounts.test.ts` with a direct `signUp.email` call~~ —
  REVISED: `l3-client-view.test.ts` does not actually exercise Better Auth's HTTP signup flow
  (it inserts `organization`/`user` rows directly, same as this feature's L3 file); real Better
  Auth sign-up is an `apps/web`-layer concern (baseURL/cookies) that doesn't belong in
  `packages/api`'s L3 harness. Covered instead by the e2e journey (T018), which drives the ACTUAL
  sign-up form through a real browser against the real Better Auth endpoint and asserts no
  agency/organization step is reachable — a stronger proof of FR-002 than a direct API call would
  be, since it also proves the UI never exposes the `createAndActivateAgency` path.

### Implementation for User Story 2

- [X] T015 [US2] Create `apps/web/app/(client-view)/view/sign-up/page.tsx` (server component):
  same redirect-if-signed-in shape as T010; link to/from `/view/sign-in` so a traveler can move
  between the two (contracts §3)
- [X] T016 [US2] Create
  `apps/web/app/(client-view)/view/sign-up/client-sign-up-form.tsx` (client component): name +
  `CredentialsFields` (reused from T003's relocated `auth-form.js`), calls ONLY the EXISTING
  `signUpWithEmail(name, email, password)` — deliberately NEVER `createAndActivateAgency` (FR-002,
  research D1) — on success `router.push(returnTo)` + `router.refresh()`

**Checkpoint**: A traveler can go from zero account to signed-in-and-pre-filled with no
agency-creation step anywhere in the flow — the full US1+US2 loop is now self-service.

---

## Phase 5: User Story 3 - Anonymous access keeps working exactly as before (Priority: P1)

**Goal**: Every anonymous (no-session) behavior on `/view/<token>` — viewing, "Book it myself,"
hand-typed request-agent submission — is byte-identical to pre-feature behavior; sign-in is
strictly additive.

**Independent Test**: With no session cookie, open a shared trip link and submit the
request-agent form with hand-typed values; verify identical behavior/record shape to before this
feature existed.

### Tests for User Story 3

- [X] T017 [P] [US3] Extend `l3-traveler-accounts.test.ts` (T009's file) with regression
  assertions: `callerFor(null).clientView.itinerary(...)` and
  `callerFor(null).clientView.requestHandoff(...)` behave exactly per the pre-existing
  `l3-client-view.test.ts`/`l3-trip-handoffs.test.ts` assertions (re-asserted here as an explicit
  regression witness, not a duplicate of those files' ownership); a traveler session is
  `FORBIDDEN` from `workspace.whoami` and every other `workspace.*` procedure (INV-024); the
  `ClientItineraryView`/`ResolveShareLinkOutcome` payload contains no `name`/`email`/identity
  field regardless of caller session state (INV-020 — identity is returned ONLY by the new,
  separate `clientView.me` procedure, never folded into the itinerary projection)

**Checkpoint**: Zero regression to anonymous behavior or to the INV-020 allowlist projection,
proven mechanically, not just by inspection.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T018 [P] Playwright e2e spec `tests/e2e/traveler-account-journey.spec.ts`: sign up as a
  traveler from a shared trip page (assert the DOM contains no agency/organization
  field/button/copy anywhere — INV-024 negative check) → open the request-agent form → confirm
  pre-filled name/email → edit the name → submit → sign out → reload → confirm the form is
  blank again → sign back in → open a SECOND shared trip (different token) → confirm the same
  pre-fill appears (per-account, not per-trip, US1 AS3)
- [X] T019 [P] Run `pnpm run lint` and fix any findings across all new/edited files
- [X] T020 [P] Run `pnpm test` (full root suite) — confirm zero regressions in existing
  client-view/workspace/trip-handoffs suites alongside the new tests
- [X] T021 Run quickstart.md end-to-end against the built compose stack (INV-027 Live Test —
  see kitchenloop-execute SKILL.md step 4e for the full protocol); capture screenshots to
  `.kitchenloop/evidence/7/p2-consumer-accounts-identity/`
- [X] T022 Write the sealed UAT test card to
  `.kitchenloop/uat-cards/p2-consumer-accounts-identity.md` per the UAT Gate protocol

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (`clientView.me` must
  exist before any UI can call it, and the relocated `auth-form.tsx` must exist at its new path
  before either new form imports it).
- **User Story 1 (Phase 3)**: Depends on Foundational only. Deliverable is real (a pre-existing
  or DB-seeded traveler can sign in and see prefill) even before self-service sign-up exists.
- **User Story 2 (Phase 4)**: Depends on Foundational only for its own code (T015/T016 are new,
  independent files) — but the FULL self-service loop (account creation → sign-in → prefill) is
  only end-to-end demoable once BOTH US1 and US2 are done. Implemented after US1 so a manual
  tester always has a working sign-in target to land on.
- **User Story 3 (Phase 5)**: Depends on Foundational + US1 (the regression assertions are most
  meaningful once `clientView.me` and the identity-aware page/component changes exist, so any
  accidental coupling between the new identity path and the existing anonymous path is caught).
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T002/T003 (Phase 2) touch unrelated files and can run in parallel; T006/T007/T008 can each
  run parallel to one another once their respective dependencies (T004/T005) land.
- T010/T011 (US1 sign-in page+form) and T015/T016 (US2 sign-up page+form) are different files
  and could be built in parallel once Phase 2 is done, even though US2 is sequenced after US1
  above for demo-ability reasons.
- T019/T020 (lint/test) in Polish can run in parallel with T018 (e2e) being drafted.

---

## Implementation Strategy

### MVP Scope Note

Unlike a typical spec-kit feature, US1 alone is NOT independently demoable end-to-end without
SOME way to create a traveler account — today that is only the DB-seeded fixture T009 uses (L3
test convenience) or US2's self-service sign-up. **Practical MVP = Foundational + US1 + US2
together** (Phases 2-4): that is the smallest slice a real user can exercise start-to-finish.
US3 (Phase 5) is a regression-proof phase, not new user-facing capability, and can trail.

### Incremental Delivery

1. Foundational (Phase 2) → validate `clientView.me` directly via the L3 harness (T009's first
   assertions) before touching any UI.
2. Phase 3 (US1) → validate prefill against a DB-seeded traveler.
3. Phase 4 (US2) → validate the full self-service loop end-to-end; this is the first point a
   manual/live-test tester can complete the whole journey through the UI alone.
4. Phase 5 (US3) → validate zero regression (run the FULL existing client-view/trip-handoffs
   suites alongside the new ones, not just the new assertions).
5. Phase 6 (Polish, Live Test, UAT card).

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- T017's INV-020/INV-024 regression assertions are the single most important tests in this
  feature — a client-view feature that accidentally leaked identity into the redacted
  `ClientItineraryView`, or accidentally let a traveler session touch `workspace.*`, would be a
  worse regression than shipping no feature at all. Do not mark User Story 3 complete without
  both passing against real Postgres.
- Commit after each task or logical group.
