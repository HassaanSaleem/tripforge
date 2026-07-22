# Kitchen Loop Report - Iteration 11

## Scenario: Traveler tries to organize and join a group trip (campaign frontier)
**Date**: 2026-07-22
**Mode**: strategy
**Tier**: T3 Frontier
**Features Exercised**: marketplace (group departures), trust (auth boundary / INV-024) — **user_type: client (traveler)** — platform: api + web

### Why this scenario
The active operator campaign (`GOAL.md`, base `campaign/two-sided-surface`) builds
out the two-sided consumer surface. Its **newest and thinnest deliverable is group
travel (D2.5 / D2.6)** — a capability not in the PRD, explicitly operator-authorized
for this pass. GOAL asks that a signed-in **traveler** be able to:

- **D2.5** — *plan* group trips: create a group, post it, invite friends, chat
  in-group, require **all parties to confirm before finalizing**, gated so **only
  verified, identity-validated premium members may post or join** (Principle VI,
  trust enforced mechanically).
- **D2.6** — *join* group trips already running, **including agent-hosted departures**.

Coverage is nominally 36/36 (100%), but that counts *declared* combos — 31 pass /
**5 fail**, and **3 of the 5 fail cells sit on the consumer surface** (`booking×web×client`
self-book stub, `marketplace×web×client`, `marketplace×api×client`). This scenario
walks the group-trip corner of that consumer frontier as a real traveler, produces a
grounded gap analysis, and leaves durable witnesses that flip green the day the
feature lands. It is a distinct client-surface gap from the prior self-book (iter-7)
and marketplace-browse (iter-8) attempts.

## What I Did (as a user)

I booted the live compose image (`docker compose up --build --wait` → postgres /
mailpit / migrate / web all Healthy) and used the product two ways as a brand-new
traveler named "Nadia Chen" who wants to organize an Umrah + Istanbul trip with three
friends.

**1. Live API journey** (`scenarios/incubating/traveler-group-trip-attempt/scenario.mjs`,
run against `http://localhost:3000` — real HTTP → parsed tRPC error envelope → typed
code assertions; **13/13 checks PASS**):

- Signed up for a consumer account (`/api/auth/sign-up/email`) and confirmed I was
  authenticated on the client surface (`clientView.me` returns my identity).
- Tried to **browse joinable group departures** → `workspace.groupTravel.browse` →
  **FORBIDDEN** (I can't even *see* what's joinable).
- Tried to **create/post my own group** → `workspace.groupTravel.post` → **FORBIDDEN**.
- Tried to **join a departure** → `workspace.groupTravel.join` → **FORBIDDEN**.
- Tried to **cancel** → `workspace.groupTravel.cancel` → **FORBIDDEN**.
- Confirmed the boundary is an *auth* boundary, not a not-found: the refusal lands in
  the `agentProcedure` middleware **before any resolver/DB access** (missing `agencyId`),
  and an **anonymous** caller gets **UNAUTHORIZED** — distinct from my traveler FORBIDDEN.
- Probed for a **consumer** group surface — `clientView.groupTravel.{browse, post,
  invite, chat, confirm, join}` — **all six are missing procedures (NOT_FOUND)**.

**2. Live browser journey** (Playwright MCP; screenshot at
`.kitchenloop/evidence/iteration-11/iteration-11-traveler-home-no-groups.png`):

- Signed up at `/view/sign-up`, landed on the traveler home `/view`.
- The home shows exactly **three tiles**: **My Trips** (active), **"Plan a trip"**
  (*Coming soon*, `aria-disabled`), **"Discover what's hot"** (*Coming soon*,
  `aria-disabled`). **There is no group-trips tile at all** — group travel isn't even
  signposted as coming.
- Navigated to a plausible `/view/groups` → falls through to the neutral client-view
  not-found ("This trip link isn't available") — **no consumer group-trip route exists.**

**3. Source corroboration** (to ground the gap analysis, not to hunt bugs):

- `packages/api/src/routers/group-travel.ts` — every procedure (`post` / `join` /
  `browse` / `cancel`) is `agentProcedure`. There is no traveler/public procedure.
- `joinGroupDepartureInputSchema` takes `travelerName` + optional `travelerEmail` —
  the traveler is **agent-entered data on a seat, never the authenticated caller.**
- The `/discover` "What's Hot" feed is agent-gated and does not surface group
  departures; consumer pages contain zero group-trip references.

## What Worked

- **The trust boundary is airtight (Principle VI / INV-024).** A consumer account
  cannot escalate into any agent-only group-travel procedure — refused in the auth
  middleware before touching business logic, exactly as booking and marketplace are.
  Anonymous vs. traveler are correctly differentiated (UNAUTHORIZED vs. FORBIDDEN).
- **Traveler identity works.** Sign-up creates an org-less consumer, auto-signs-in,
  and `clientView.me` resolves — the consumer identity plumbing (spec 030) is solid.
- **An agent-side group-travel v0 exists** (spec 021): agents post departures, join
  seats on behalf of named clients with capacity conservation, browse, and cancel.
  The engine and money/seat semantics are there — what's missing is the *traveler as
  an actor* on top of it.

## Friction Points

- **A traveler hits a wall at literally every step of the group-trip story.** They
  cannot discover a joinable departure, cannot join one, cannot create one, cannot
  invite, cannot chat, cannot confirm. Every GOAL D2.5/D2.6 verb returns FORBIDDEN or
  NOT_FOUND. From the traveler's seat the capability is 0% present.
- **No signposting.** The traveler home advertises "Plan a trip" and "Discover" as
  *Coming soon*, which sets an expectation the surface is being built — but group
  trips, the campaign's marquee new capability, aren't even mentioned, so a traveler
  has no signal it's coming.
- **The current join shape is the wrong side of the market for the consumer story.**
  `join(travelerName, travelerEmail)` models "an agent adds my name to a seat," not "I
  join." Bringing travelers in isn't a thin RBAC relaxation of the existing procedure —
  a traveler-authenticated join needs its own identity/premium-gated path.

## Bugs Found

**None.** This is a *frontier gap*, not a defect: the boundary behaves correctly
(refusing a traveler is the right answer *today*, because no consumer group path is
designed yet). Nothing regressed; the known do-not-weaken resale KNOWN-BUG
(`marketplace×api×agent-reseller`, RESALE-SHARE-SEMANTICS) was not touched.

## Missing Features

> These are **operator-authorized** (GOAL.md D2.5/D2.6 pull group trips into this pass),
> so unlike out-of-phase P2 items, triage **should file them as campaign tickets**, not
> merely note them.

- **[FEAT-1] Traveler-authenticated group-trip surface (the headline gap).** A consumer
  `clientView.groupTravel.*` (or equivalent) surface so a signed-in traveler can:
  1. **Browse joinable departures** (D2.6) — a read projection of active, joinable
     agent-hosted *and* traveler-created departures (sell-price only, INV-020).
  2. **Create/post a group** from a plannable itinerary (D2.5) — traveler-as-organizer.
  3. **Invite friends** and **chat in-group** (D2.5, trust/safety-by-design).
  4. **All-parties-confirm-before-finalize** (D2.5) — a mechanical gate in the
     transaction path, not a policy doc; finalization blocked until every joined party
     confirms.
  5. **Premium / identity-validated gating** (D2.5, Principle VI) — only verified,
     identity-validated premium members may post or join, enforced in the mutation.
  6. **Traveler-authenticated join** of an agent-hosted departure (D2.6) — its own
     procedure, capacity-conserving (INV-011), distinct from the agent-on-behalf-of path.
  - *Money/schema note:* any seat purchase is a money path (L3 conservation tests +
    live validation, Principle VI). Group trips must remain the **same canonical
    itinerary entity** (Principle IV) and **feed the marketplace/agent network**
    (Principle I) — traveler-created groups should route into the agent departure/
    marketplace fabric, not become a standalone consumer planner. If the design needs a
    traveler↔departure ownership association or any revenue-share/take-rate on group
    seats, that is a **canonical-schema / revenue-share change → ALWAYS-HALT** (DIRECTIVE
    §2) and must go to the operator desk before implementation, exactly as the
    self-book v0 ruling (`goal-consumer-selfbook`) was scoped to stay inside existing
    money math.

- **[FEAT-2] Group departures on the discovery feed.** The "What's Hot" feed (D2.2) is
  meant to be actionable and agent-connected; joinable group departures are the most
  natural actionable feed item and are currently absent from it.

## Improvements

- **[IMP-1] Signpost group trips on the traveler home.** Add a "Group trips —
  *Coming soon*" tile alongside "Plan a trip" / "Discover" so the campaign's flagship
  capability is visible on the surface (a small, honest, pre-feature UX affordance).

## Tests Added

- `scenarios/incubating/traveler-group-trip-attempt/scenario.mjs` — L3 live HTTP
  frontier witness; **13/13 checks PASS** against the booted compose image. Proves the
  auth boundary (traveler FORBIDDEN / anonymous UNAUTHORIZED across all four
  `workspace.groupTravel.*` procedures) and the absence of any `clientView` group
  procedure. Carries a `KITCHENLOOP-COVERAGE` block (trust×api×client = pass;
  marketplace×api×client = fail).
- `packages/api/src/__tests__/group-travel-rbac.test.ts` — L2 contract test;
  **8/8 PASS** (verified in the built verify image). Durable **oracle-runnable** witness
  (no DB needed) that the group-travel authorization ladder holds: anonymous →
  UNAUTHORIZED, traveler → FORBIDDEN, across post/browse/join/cancel. This test flips
  the day a traveler-authenticated path is added, forcing an intentional update.
- Regenerated `.kitchenloop/coverage-matrix.yaml` via `derive-coverage.mjs` (vocabulary
  validated, exit 0) — now 36/36 declared (31 pass / 5 fail), correcting stale drift in
  the committed matrix (was 28/36 on disk).

## Evidence

- API scenario run: `13/13 checks PASS` (stdout captured in this session).
- L2 test: `Test Files 1 passed (1) · Tests 8 passed (8)` in `tripforge-verify:latest`.
- Browser: `.kitchenloop/evidence/iteration-11/iteration-11-traveler-home-no-groups.png`
  (traveler home, three tiles, no group affordance); `/view/groups` → neutral not-found.
- Stack booted Healthy and torn down (`docker compose down -v`) after the run.

## Outcome

**SUCCESS** — Gap analysis complete and grounded in live API + browser + source
evidence. The trust boundary is verified correct; the campaign's group-trip deliverable
(D2.5/D2.6) is **0% present from the traveler's seat** — no consumer group-travel API,
no consumer route, no home affordance, and the existing join models the traveler as
passive data rather than an actor. Two durable regression witnesses landed (one in the
fast oracle, one live) that will force an intentional flip when the feature is built.
Triage should convert FEAT-1 (with its ALWAYS-HALT schema/revenue-share caveat surfaced
to the operator desk before build) and FEAT-2/IMP-1 into campaign tickets.
