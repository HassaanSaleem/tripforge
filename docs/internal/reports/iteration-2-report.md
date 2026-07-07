# Kitchen Loop Report - Iteration 2

> Note: this is the iteration-2 **re-run**. A prior iteration-2 ideate (committed as
> 4bd4cbd on origin/kitchen/iter-2) verified the trust boundary at the in-process
> caller layer but was environment-blocked from all live verification (Docker could
> not pull base images). Its findings were already triaged into seed-0007 (done),
> seed-0008, seed-0009 — those are NOT re-reported here. This run picks up exactly
> where that one was blocked: the LIVE stack.

## Scenario: First live user journey — new agent onboards via auth API to the workspace; client opens the branded view
**Date**: 2026-07-07
**Mode**: strategy
**Tier**: T1 Foundation
**Features Exercised**: trust (auth, agency/org creation, RBAC ladder, tenant scoping
INV-004, brand boundary INV-020, surface separation INV-024) — platforms web + api;
user_types agent-seller + client
**Codex check**: PROCEED (confirmed the scenario exercises new ground: first live
compose boot, first live auth/org/session path, first authenticated browser workspace
visit)

Tier rationale: coverage was 0/36 and NOTHING had ever been exercised live (iter-1:
Docker daemon down; prior iter-2: image pulls OOM). T2 composition is not yet
possible — trust is the only feature with a live server surface (booking, marketplace,
itinerary CRUD, content library are seeds 0003–0006, still todo). Per the T1 charter:
the basic stuff — can a user even get in the door? — must be bulletproof first.

## What I Did (as a user)

1. **Control plane**: no HALT; DIRECTIVE read; desk empty (REG-L3-STACK resolved by
   the operator since the last run).
2. **Priority Zero check**: `verification.oracle.smoke_command` is wired
   (`node tests/integration/smoke.mjs`, D-004). Verified it runs — see step 5.
3. **Booted the documented stack** from a fresh checkout state (this worktree has no
   `node_modules` — same as any new clone): `docker compose down -v && docker compose
   up --build --wait` → **BUILD FAILED**: `sh: next: not found` in the web build stage
   (and the same latent failure sits in the migrate stage for `drizzle-kit`). Root
   cause diagnosed and fixed in this worktree (BUG-1 below), rebuild → **all four
   services healthy** (postgres, mailpit, migrate exited-ok, web).
4. **Ran the wired L3 smoke against the live stack**: `node tests/integration/smoke.mjs`
   → **PASSED 5/5** (health 200 + real DB round-trip, sessionless whoami rejected,
   public tRPC health 200). First green live run of the L3 oracle in loop history.
5. **Onboarded two brand-new agents end-to-end over live HTTP** (scenario script,
   emulating a browser: Origin header + cookie jar): sign-up (`/api/auth/sign-up/email`)
   → fresh user is correctly FORBIDDEN at `workspace.whoami` (traveler tier, INV-023)
   → create agency (`/api/auth/organization/create`) → set-active → `workspace.whoami`
   now returns `{userId, agencyId, role: "owner"}` (INV-004 tenant scope) → `/workspace`
   HTML greets the agent. Two agents landed in two DIFFERENT tenants (INV-004 live).
   **26/27 assertions green** — the one red is a real product bug (BUG-2).
6. **Drove the journey in a real browser** (Playwright MCP): landing → anonymous
   `/workspace` (membership prompt) → in-page sign-up + agency creation (cookies in the
   real browser session) → `/workspace` greets the agent → `/view`. Screenshots in
   `.kitchenloop/evidence/iter-2/ideate-agent-onboarding/` (01-landing, 02-workspace-
   anonymous, 03-workspace-agent, 04-client-view). Browser-witnessed:
   `document.title === "TripForge"` on `/view` (`inv020TitleLeak: true, bodyLeak: false`).
7. **Compose-log scan**: zero `ERROR|FATAL|Unhandled` lines across all services.
8. **Torn down** with `docker compose down -v` (clean environment for regress, which
   boots its own stack per REG-L3-STACK Option 2).

## What Worked
- **The whole onboarding funnel works live, first try**: Better Auth sign-up, the
  organization plugin (agency = org), active-org session mapping, the tRPC role/tenant
  middleware, and the workspace page gate all compose correctly on the built image.
  26/27 live assertions green with NO product code changed for any of them.
- **The RBAC ladder holds live exactly as the L2 caller tests promised**: anonymous →
  401 UNAUTHORIZED; signed-up-but-no-agency → 403 FORBIDDEN; owner → scoped identity.
  The L2→L3 contract translation is faithful.
- **L3 smoke gate is real and green** (Priority Zero satisfied): it fails loudly when
  the stack is down (verified in the prior run) and passes against a healthy stack.
- **Compose logs are clean** under real traffic — no error lines at all.
- **Docker environment blockers are gone** (daemon up, images cached, 234 GB free) —
  REG-L3-STACK Option 2 is environmentally feasible now.

## Friction Points
- **The loop runtime denied ALL `pnpm` commands this session** (`pnpm install`,
  `pnpm install --frozen-lockfile`, `pnpm test`) even though `.claude/settings.json`
  explicitly allowlists them. The prior ideate ran `pnpm install` fine, so the harness
  permission wiring regressed between runs. Consequence: L1/L2 vitest and eslint could
  not be run locally this session (regress runs them in its own runtime). This is
  loop-infrastructure friction, not a product bug — flagged for the operator/loop
  review rather than ticketed as product work.
- **Playwright MCP screenshots stall after the first shot on a page** (5s backend
  timeout); workaround is close-page → re-navigate → shoot. Cost several minutes of
  evidence collection. Loop-infra friction, not product.
- **The workspace greets an agent with raw IDs** (`Signed in as agent uMOWV… · agency
  WGwvq… · role owner`) instead of the agency/user names — fine for a skeleton, opaque
  for a real user (IMP-2).
- **`/favicon.ico` 404s** on every page load — the only browser console error in the
  whole journey (IMP-3).
- **API-only clients must send an Origin header** on Better Auth POSTs or get
  `403 MISSING_OR_NULL_ORIGIN` — correct CSRF behavior, but worth remembering for
  future scenario/e2e authors (documented in the scenario README; no action needed).

## Bugs Found

- **[BUG-1] `docker compose up --build` fails on every fresh checkout — the built
  image was never hermetic (INV-019/027 spirit).** The Dockerfile's `migrate` and
  `build` stages copy only the workspace-root `node_modules` from the deps stage, but
  pnpm places each package's bins in per-package `node_modules`
  (`apps/web/node_modules/.bin/next`, `packages/db/node_modules/.bin/drizzle-kit`).
  With an EMPTY `.dockerignore`, `COPY . .` silently imported the HOST's installed
  `node_modules` on the operator's machine, masking the bug — the "built image" gate
  (INV-027) has been quietly depending on host state. On a fresh clone (or this
  worktree): `sh: next: not found`, build dead. CI can't see it either — it never
  builds the image (lint/test/depcruise only). **Repro**: clone fresh (no
  node_modules), `docker compose up --build` → web build fails at
  `RUN pnpm --filter @tripforge/web build`. **Fixed and verified in this worktree**
  (build green from clean context, stack healthy, smoke 5/5): `apps/web/Dockerfile`
  now copies the whole installed workspace from deps (`COPY --from=deps /app ./`) in
  both stages, and a real `.dockerignore` excludes `node_modules`/`.next`/`.git`/
  `.kitchenloop`/`.claude` so host state can never leak into the image again.
  Needs to land on main via a ticketed PR (same path as seed-0007 took for
  ideate-authored files).

- **[BUG-2] INV-020 violation, live: the traveler's browser tab says "TripForge".**
  Root `apps/web/app/layout.tsx` exports `metadata = { title: "TripForge", … }`, which
  the `(client-view)` route group inherits — so `/view` renders
  `<title>TripForge</title>` + the platform description meta. INV-020 says the client
  surface carries the AGENT's brand only; the tab title is user-visible branding.
  Browser-witnessed (`document.title === "TripForge"`, screenshot 04) and pinned by a
  failing assertion in the scenario script (the only red of 27). **Repro**: open
  `/view`, look at the tab title. **Fix direction** (not applied — product behavior,
  execute's job): per-route-group metadata via `(client-view)/layout.tsx` (route
  groups exist for exactly this, INV-024), platform title only in the
  `(workspace)`/root groups.

- **[BUG-3] The INV-020 e2e negative can't see the leak it exists to catch (false
  confidence, second layer).** `tests/e2e/trust-boundary.spec.ts` (authored precisely
  to pin the INV-020 negative after the smoke-test false-confidence finding) asserts
  `getByText(/TripForge/i)` has count 0 — but `getByText` only matches rendered BODY
  text, never `<title>`/metadata. Run live today it would PASS while BUG-2 is
  violating the invariant in the same tab. The spec needs a
  `await expect(page).not.toHaveTitle(/TripForge|Trellis/i)` (or `document.title`)
  assertion — an assertion ADDITION, never a weakening; it belongs in the same PR as
  the BUG-2 fix so it fails-red-then-green meaningfully. (Not edited here; the
  scenario script's raw-HTML regex already pins the stronger negative.)

## Missing Features
- (none newly ticketable in P0 — the known gaps are already seeds: sign-in UI =
  seed-0008, itinerary builder/booking/marketplace = seeds 0003–0006. Composition
  (T2) scenarios stay impossible until at least one of seeds 0003/0005/0006 lands;
  that sequencing pressure is the point of note FEAT-OBS-1 below.)
- **[FEAT-OBS-1 — observation for triage, not a new feature]** Trust is currently the
  ONLY feature with live surface; every other spec-surface feature is un-exercisable.
  The backlog phase should keep seeds 0003→0005 at the top so the loop can graduate
  to T2/composition scenarios.

## Improvements
- **[IMP-1] Anyone who signs up can create an agency and instantly become an
  agent-owner** (Better Auth org plugin defaults; no email verification required —
  sign-up returns a live session immediately, mailpit never involved). For a P0
  agent-side MVP this openness may be intended (it is the only onboarding path that
  exists), but it has trust/provenance weight (Constitution VI) once the marketplace
  lands: agenthood = marketplace supply. Worth an explicit product decision note in
  the seed-0006 spec (who may list?) rather than an accidental default.
- **[IMP-2] Workspace greeting should show human names** (agency name, user name)
  instead of raw IDs once any real workspace UI lands (cheap to fold into seed-0008).
- **[IMP-3] Add a favicon** — kills the only console error on every page.
- **[IMP-4] CI never builds the compose image**, so BUG-1-class breaks are invisible
  to every merge gate (`ci_pass` = lint + unit + depcruise). Suggest an image-build
  job (or at least `docker build --target build`) in CI. CI is a merge gate, so this
  is operator territory — triage should surface it as a desk-row candidate, not a
  loop commit.

## Tests Added
- `scenarios/incubating/agent-onboarding-live/scenario.mjs` — 27-assertion L3-style
  live journey (dependency-free Node, browser-emulating): full two-agent onboarding
  with before/after state deltas on the gated procedure, INV-004 tenant isolation,
  INV-023 ladder negatives, INV-024 anon prompt, INV-020 raw-HTML brand negative
  (currently red on purpose — pins BUG-2). **PROVEN live: 26/27** against the built
  compose image, 2026-07-07.
- `scenarios/incubating/agent-onboarding-live/README.md` — run instructions + the
  known-red assertion contract (do not weaken).

## Files Changed
- `apps/web/Dockerfile` — BUG-1 fix (verified: clean-context build green, stack
  healthy, smoke 5/5). Product change → needs a ticketed PR to land on main.
- `.dockerignore` — new (hermetic build context; part of the BUG-1 fix).
- `scenarios/incubating/agent-onboarding-live/{scenario.mjs,README.md}` — new.
- `docs/internal/reports/iteration-2-report.md` — this report.
- `.kitchenloop/coverage-matrix.yaml` — 3 combos recorded (2 pass, 1 fail).
- `.kitchenloop/evidence/iter-2/ideate-agent-onboarding/*.png` — 4 screenshots
  (git-ignored evidence).

## Outcome
**PARTIAL (strong).** The live stack booted, the L3 oracle went green live for the
first time, and the entire agent onboarding funnel was proven end-to-end in both HTTP
and a real browser — 26/27 assertions. PARTIAL, not SUCCESS, for two honest reasons:
one critical infra bug had to be fixed mid-scenario to make the product bootable at
all from a clean checkout (BUG-1, fix verified in-worktree but not yet landed on
main), and one real invariant violation is live in the product (BUG-2 INV-020 title
leak, pinned red by the scenario). L1/L2 + lint could not be run in this session
(pnpm permission-denied at the harness layer — loop-infra friction, flagged).
