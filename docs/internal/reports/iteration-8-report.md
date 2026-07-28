# Kitchen Loop Report - Iteration 8

## Scenario: A traveler tries to discover and act on a marketplace itinerary (book as-is / fork / request-agent / self-book)
**Date**: 2026-07-22
**Mode**: strategy
**Tier**: T3 Frontier
**Features Exercised**: marketplace, revenue-share (client read side), trust — `user_type=client`, `platform=web+api`
**Campaign**: `campaign/two-sided-surface` (GOAL.md) — build out the traveler/client surface. This scenario probes GOAL Deliverable 2.7 ("act on a marketplace itinerary") and 2.2 ("see what's hot") from the traveler's side, filling the **last untested client-surface marketplace cluster** (`marketplace × {web,api} × client`).

## Context / why this scenario
Coverage stands at 31/36 (86.1%); the remaining 5 untested combos are client-surface-dominated
— exactly the operator campaign's build-out target. Two of those 5 are the marketplace client
cells (`marketplace × {web,api} × client`), which no scenario has ever touched: every prior
marketplace pass exercised the agent-seller / agent-reseller sides. Iteration 7 deeply probed the
*shared-trip* traveler surface (view / handoff / self-book stub) but explicitly deferred the
*marketplace* side (its FEAT-5: "a traveler cannot reach the marketplace today"). The backlog is
**0 open** (fresh campaign), so ideate's highest-value contribution is a concrete, reproducible,
mechanically-witnessed gap map that seeds the campaign's marketplace-side execute cycles.

This is a **Tier 3 Frontier** pass: a traveler acting on a listed itinerary largely does not exist
yet, so the deliverable is a gap analysis. I still wrote a durable L3 regression witness for what
*does* exist (the trust boundary) and drove the live browser for the web surface.

Tier balance also favored T3: iterations 6 and 7 were both T2; the 20%-weight T3 slot was due.

Codex feasibility check: **PROCEED** — "the repo has real marketplace listing/licensing
machinery … `workspace.marketplace.*` is guarded by `agentProcedure`, so a traveler session should
mechanically receive `FORBIDDEN`. It exercises new coverage … traveler/client marketplace
browse/discover/action is absent."

## What I Did (as a user)
1. **Arranged a real, non-empty marketplace** (headless L3): a fresh agency signs up, drafts a
   budget-fit Kyoto itinerary with the AI, is vetted (operator `agency_vetting` insert), and
   **lists it** via `workspace.marketplace.createListing` (30000 minor, 750 bps share). Confirmed
   the listing is live by browsing it back from the seller's own session — plus the seeded
   "Lisbon Getaway" listing is already there, so the marketplace is genuinely non-empty.
2. **Signed up a fresh traveler** (`yuki.marketplace.iter8@…`) — an org-less consumer account
   (verified `member` count = 0), then confirmed the account is a real signed-in identity
   (`clientView.me` resolves), so every refusal below is *authorization*, not a missing session.
3. **Tried to browse the marketplace** as the traveler → `workspace.marketplace.browseListings`
   returns **FORBIDDEN** (agentProcedure, INV-024).
4. **Tried to license / acquire the listed trip** → `workspace.marketplace.licenseListing`
   returns **FORBIDDEN**. **Tried to rate it** → `workspace.marketplace.rateListing` **FORBIDDEN**.
5. **Looked for any consumer-side capability** — probed `clientView.browseListings`,
   `clientView.discover`, `clientView.whatsHot`, `clientView.licenseListing`, `clientView.book`:
   **every one returns NOT_FOUND**. The client router has exactly five procedures
   (`itinerary` / `requestHandoff` / `me` / `attachTrip` / `myTrips`) — all about a *shared* trip,
   none about a *listed* one.
6. **Checked the trust ladder** — an anonymous (no-session) browse is **UNAUTHORIZED** (distinct
   from the traveler's FORBIDDEN), confirming the gate discriminates correctly.
7. **Confirmed state conservation** — across the whole traveler journey: **zero** new
   `marketplace_license` rows and **zero** new `itinerary` rows. A traveler acquires nothing,
   forks nothing, books nothing. And the listed itinerary mints **no** consumer-reachable share
   token, so a traveler has no entry point to it at all.
8. **Drove the live browser** (Playwright MCP, signed in as the traveler):
   - `/view` (traveler home) → shows **"Plan a trip"** and **"Discover what's hot"** as
     **aria-disabled "Coming soon"** tiles; the only live affordance is "My Trips". No marketplace
     link anywhere.
   - `/marketplace` → the agent-only gate: *"Agent marketplace — You need an agency membership to
     trade on the marketplace. Sign in … or create an account and agency."*
   - `/discover` → the same gate: *"You need an agency membership to use Discover … create an
     account and agency."*
   - Console clean (0 errors / 0 warnings) across the journey; compose web-log scan clean.
9. **Re-proved the load-bearing facts headlessly** as an L3 scenario
   (`scenarios/incubating/traveler-marketplace-attempt/scenario.mjs`, **22 checks, all pass**
   against the live built compose stack).

## What Worked
- **Trust boundary is airtight.** Every marketplace acquisition procedure
  (browse / license / rate / create / deactivate) is `agentProcedure`; a traveler is refused
  FORBIDDEN and an anonymous caller UNAUTHORIZED, through the single `agentProcedure` choke point
  (`packages/api/src/trpc.ts` — throws when `!session.agencyId`, INV-024). The trade/money path is
  structurally closed to consumers; state is conserved.
- **The marketplace itself works** for its intended (agent) users — a vetted seller lists, and the
  listing is browsable/licensable agent-to-agent (re-confirmed here as the arrange step).
- **The traveler account plumbing** (org-less identity, `clientView.me`, sign-up) works, matching
  iteration 7.
- **Honesty of the "Coming soon" tiles** — the consumer surface does not *pretend* the planner/feed
  exist; it labels them disabled (better than the `/for-travelers` landing, which iteration 7 found
  overpromises "book it yourself").

## Friction Points
- **[FRICTION-1] A signed-in *traveler* is told to "create an account and agency".** Both
  `/marketplace` and `/discover` route a consumer to *become an agent* — the wrong funnel for a
  two-sided product. A traveler who lands on these (e.g. via a stray link, a bookmarked URL, or a
  future consumer feed) is pushed onto the supply side, not offered the consumer path. Same
  overpromise/mis-routing class as the `/for-travelers` "plan a trip" copy (iter-7 FRICTION-1) and
  the marketplace "earn a share on every resale" copy (desk RESALE-SHARE-SEMANTICS).
- **[FRICTION-2] The traveler home advertises capabilities that ship disabled.** `/view` surfaces
  "Plan a trip" and "Discover what's hot" as "Coming soon" tiles. Honest, but it means the consumer
  home is still a near-dead-end (My Trips + two disabled tiles) — the campaign's D2.2/D2.3/D2.7
  promises are all signposted-but-absent.
- **[FRICTION-3] Sign-up still frames the account as an autofill helper** — *"Create an account to
  have your name and email fill in automatically."* — unchanged from iter-7 FRICTION-3. The account
  reads as a handoff-form convenience, not the identity behind a self-serve marketplace/planner.

## Bugs Found
None. This is a **capability gap**, not a defect: the trust boundary behaves correctly and no
error/crash occurs. The absence of a consumer marketplace surface is the finding, not a bug in an
existing one. (The FRICTION-1 mis-routing is a UX/product-shape issue, not a functional bug.)

## Missing Features
(All within the operator-authorized P2 pull-forward campaign — GOAL.md. Listed for triage to
convert into the campaign's marketplace-side execute tickets. Several depend on the iteration-7
FEAT-1 self-book money path, which is the shared prerequisite.)
- **[FEAT-1] Consumer marketplace browse (GOAL D2.7, `marketplace × client`).** A traveler-scoped
  read of listings — the consumer-facing analog of `browseListings` — projecting only client-safe
  fields (INV-020: sell price / terms, never net-rate/markup/agencyId). Today there is no
  consumer browse at all; `browseListings` is agent-only and returns internal fields
  (`sellerAgencyId`, etc.).
- **[FEAT-2] Consumer "act on a marketplace itinerary" (GOAL D2.7).** The four D2.7 verbs from the
  traveler side: **book as-is**, **fork/edit**, **request-an-agent to host/book**, or **self-book
  through the platform**. Request-an-agent can reuse the existing `clientView.requestHandoff`
  funnel (Constitution I) but needs a *listing→handoff* entry (today handoff needs a shared token,
  which a listing never mints — see the conservation check). Book-as-is / fork / self-book all
  require the **iteration-7 FEAT-1 self-book money path** first. **Fork/resale/client-ownership/
  revenue-share semantics are Principle-VI governed — changing them ALWAYS HALTS (DIRECTIVE §2);
  a v0 that stays inside existing money math (per the GOAL "goal-consumer-selfbook" ruling) does not.**
- **[FEAT-3] Consumer What's-Hot discovery feed as a real capability (GOAL D2.2, PRD §9.7).** Today
  the feed is **static seed data** (`apps/web/lib/discover-feed.js`) rendered client-side *inside*
  the agent-gated `(workspace)/discover` page — it is not a server procedure and not reachable by a
  traveler. The campaign wants a bookable, agent-connected consumer feed; that needs a real
  `discover`/`whatsHot` procedure feeding listings/bookable trips to the consumer surface.
- **[FEAT-4] Wire the traveler-home "Coming soon" tiles to real destinations.** Once FEAT-1/2/3
  land, "Plan a trip" → the consumer chat-first planner (GOAL D3) and "Discover what's hot" → the
  consumer feed. Until then the consumer home is My Trips + two disabled tiles.

## Improvements
- **[IMP-1] Give a traveler session a consumer-appropriate response on `/marketplace` and
  `/discover`** instead of "create an account and agency." Even before the consumer surfaces ship,
  a traveler hitting these should see a consumer message (e.g. "Discovery is coming to your
  account soon" or a route back to `/view`), not a prompt to become an agent. Cheap, decouples the
  UX fix from the larger FEAT builds.
- **[IMP-2] Reconcile the traveler account's value prop** (carries over from iter-7 IMP-2): the
  sign-up autofill-helper copy vs. the home's "plan / discover" ambitions vs. the `/for-travelers`
  "book it yourself" landing all describe different accounts.

## Tests Added
- **`scenarios/incubating/traveler-marketplace-attempt/scenario.mjs`** — L3, 4-layer (real HTTP
  against the built compose image → parsed responses → Postgres ground truth → state-delta
  assertions), **22 checks, all pass** against the live stack. Proves: a vetted seller lists a real
  itinerary; a traveler is refused FORBIDDEN on browse/license/rate (agentProcedure, INV-024);
  anonymous is UNAUTHORIZED; **no** consumer `clientView` marketplace/discover/book procedure
  exists (each NOT_FOUND); and the whole traveler journey conserves state (zero new
  `marketplace_license`, zero new `itinerary`, no consumer-reachable share token). Companion
  live-browser (Playwright MCP) evidence summarized in the file header + at
  `.kitchenloop/uat-runs/traveler-marketplace-attempt/` (3 screenshots, git-ignored).
- **Coverage matrix regenerated** (`node scripts/kitchenloop/derive-coverage.mjs`). Net-new combos:
  **`marketplace × api × client = fail`** and **`marketplace × web × client = fail`** — the last two
  marketplace client cells, both recorded as capability gaps (the trust boundary *correctly* refuses
  the agent path; the *consumer* path is absent — the campaign's target work, same convention as
  iteration-7's `booking × web × client = fail` self-book stub).

## Outcome
**SUCCESS** — the frontier probe completed end-to-end and mapped the marketplace client gap with
hard, reproducible, mechanically-witnessed evidence. The story mirrors iteration 7's self-book
finding, one layer out: the traveler surface's *trust plumbing* is solid (a consumer cannot reach or
corrupt the agent trade path), but its *consumer value* — discovering and acting on a marketplace
itinerary (GOAL D2.7) and a real What's-Hot feed (GOAL D2.2) — **does not exist yet**. The consumer
home even signposts these as "Coming soon". All findings sit inside the operator-authorized P2
campaign scope; none are out-of-phase. With this pass, all six marketplace × {web,api} × user_type
cells are now exercised, and the client surface's remaining gaps are the campaign's own execute queue.
