# Kitchen Loop Report - Iteration 7

## Scenario: The self-drive traveler — sign up, view a shared trip, and try to self-book it end-to-end
**Date**: 2026-07-21
**Mode**: strategy
**Tier**: T2 Composition
**Features Exercised**: trust, booking, itinerary-builder (client read side) — `user_type=client`, `platform=web+api`
**Campaign**: `campaign/two-sided-surface` (GOAL.md) — build out the traveler/client surface. This scenario probes GOAL Deliverable 2 (items 3, 4, 2, 7) as they exist on the campaign branch today.

## Context / why this scenario
The 8 untested coverage combos are dominated by the **client surface** (6 of 8), which is
exactly what the operator campaign (GOAL.md) is building out. The backlog has **0 open
tickets** — this is a fresh campaign, so the most valuable ideate contribution is concrete,
reproducible, evidence-backed findings that seed the campaign's first execute cycles. I acted
as a real traveler against the **live built compose stack** (already up, web healthy) and
drove the whole client surface in a real browser (Playwright MCP), then re-proved the two
load-bearing facts headlessly as an L3 regression scenario.

Codex feasibility check: **PROCEED** ("valuable new composition… `Book it myself` is
intentionally still a client-only confirmation stub… while handoff does call
`clientView.requestHandoff`").

## What I Did (as a user)
1. **Landed on `/for-travelers`** — a polished page that promises a traveler can *"plan a new
   trip with AI"*, *"book it yourself through the platform"*, or hand it to an agent. CTA:
   *"Sign in to plan a trip →"*.
2. **Signed up a fresh traveler** (`farah.traveler.iter7@…`) at `/view/sign-up`. Account
   created, redirected to `/view`.
3. **`/view` is a dead-end placeholder** — a static "Your trip / This is the traveler-facing
   view…" card. No planner, no navigation, no link to My Trips, no discovery. A brand-new
   traveler who just signed up has nowhere to go.
4. **`/view/my-trips`** works but shows the empty state (*"once your agent shares a trip
   link…"*) — agent-centric framing, no "plan a trip" affordance.
5. **Opened a shared, partially-booked trip** (`/view/{token}`, "Porto balanced trip",
   1 booked transfer + estimate items). Renders branded and brand-neutral (title "Porto
   balanced trip — Ericeira Surf Trips", no "TripForge"). Signed-in account strip shows
   *"Signed in as Farah Idrissi · My Trips · Sign out"*. Opening it **auto-added it to My
   Trips** (a `client_trip_link` row appeared at the exact open timestamp; My Trips then
   listed the Porto trip). Trip-history works end-to-end.
6. **Clicked "Book it myself"** → static panel: *"Great — you're booking this trip yourself.
   Reach out to your travel agent when you're ready to confirm and pay for each part of the
   trip."* The **browser network trace showed ZERO non-static requests** — no booking, no
   server call. DB `booking_component` count for the itinerary was unchanged (still just the
   agent's 1 booking).
7. **Clicked "Have an agent arrange this for me"** → the form **prefilled** Farah's name and
   email (spec 030 identity), I added a note, submitted → *"Request sent / Your agent has
   been notified"*. DB `trip_handoff_request` went **5 → 6**, newest row carrying Farah's
   name/email/notes and the correct `itinerary_id`. This is the only write a traveler can
   make against a shared trip, and it works.
8. **Probed `/discover`** (the What's-Hot feed) as the signed-in traveler → agent-gated:
   *"You need an agency membership to use Discover"*, routing the traveler to *create an
   agency*. No consumer discovery surface exists.
9. **Console clean** — 0 errors / 0 warnings across the whole journey (INV-027 clean).
10. **Re-proved the load-bearing facts headlessly** with a new L3 scenario
    (`scenarios/incubating/traveler-self-book-attempt/scenario.mjs`, 29 checks, all pass):
    agent drafts+books+shares → traveler signs up (org-less) → reads/attaches/handoffs OK,
    but `clientView.book` does not exist, `workspace.booking.{book,quote}` are FORBIDDEN to
    the traveler (INV-024), and `booking_component` count is unchanged by the whole traveler
    journey.

## What Worked
- **Traveler account** (org-less consumer identity, spec 030) — sign-up/sign-in works, no
  agency field, no escalation path.
- **Shared trip view** — branded, brand-neutral (INV-020), booked-vs-estimate item states
  render honestly, no confidential fields (netRate/markup/supplyRef/agencyId/provenance) leak
  to the traveler payload (verified key-scan on the live API response).
- **Trip history** — opening a shared trip while signed in auto-links it to My Trips; the list
  renders and links back to the trip.
- **Request-an-agent handoff** — real, persisted (`trip_handoff_request`), with account
  identity prefill. The demand→agent funnel (Constitution I) is intact.
- **Trust boundary** — a traveler cannot reach any agent-only procedure; the money path is
  structurally closed to consumers.
- **Landing (Deliverable 1)** — `/for-travelers` is premium, responsive, and clear.

## Friction Points
- **[FRICTION-1] `/for-travelers` overpromises vs. the built product.** It advertises "plan a
  new trip with AI" and "book it yourself through the platform," but on the campaign branch a
  traveler can do *neither* — there is no consumer planner and no self-book. Same overpromise
  class as the historical marketplace "earn a share on every resale" copy (desk
  RESALE-SHARE-SEMANTICS). The campaign *intends* to build these (D2.3/D2.4), so the right fix
  is to build them; until then the copy asserts capability that doesn't exist.
- **[FRICTION-2] The signed-in `/view` landing is a dead end.** A just-signed-up traveler is
  dropped on a static placeholder with no navigation — not even a link to My Trips. "Sign in
  to plan a trip" leads to a page that can't plan a trip.
- **[FRICTION-3] Two different value props for the same account.** `/for-travelers` frames the
  traveler account as "sign in to plan a trip," but `/view/sign-in` and `/view/sign-up` frame
  it as "fill in your name and email automatically" (an autofill helper for the handoff form).
  The account's purpose reads inconsistently.
- **[FRICTION-4] The self-drive confirmation contradicts itself.** "Book it myself" resolves to
  *"reach out to your travel agent…to confirm and pay"* — telling the self-*driving* user to go
  use an agent, which is the *other* fork's job. It's a dead end dressed as a confirmation.
- **[FRICTION-5] My Trips / `/view` framing is entirely agent-centric** ("once your agent shares
  a trip link"), reinforcing that the consumer surface is a passive viewer, not a place to act.
- **[MINOR] Demo video didn't play** in headless Chromium (*"Your browser cannot play this
  video."*) on `/for-travelers`. Likely a headless-codec artifact, not necessarily a product
  bug — worth a real-browser eyeball to confirm the `.mp4` plays for actual visitors.

## Bugs Found
- **[BUG-1] "Book it myself" is a confirmation-only stub — a traveler cannot book through the
  platform (GOAL D2.4).** Repro: sign in as a traveler → open a shared trip → click "Book it
  myself". Result: a static "you're booking this trip yourself" panel, **zero server calls**
  (browser network trace), **zero `booking_component` rows created** (DB delta 0). There is no
  client-facing booking procedure at all: `clientView.book` does not exist (returns
  procedure-not-found), and the agent-side `workspace.booking.book`/`.quote` are `agentProcedure`
  → FORBIDDEN to a traveler session (INV-024). This is the campaign's marquee gap and a **money
  path** — its build requires L3 conservation tests + live validation (Principle VI). Mechanically
  witnessed by `scenarios/incubating/traveler-self-book-attempt/scenario.mjs`.

## Missing Features
(All within the operator-authorized P2 pull-forward campaign — GOAL.md. Listed for triage to
convert into the campaign's first execute tickets.)
- **[FEAT-1] Real self-serve self-book money path (GOAL D2.4).** A traveler-scoped booking
  capability (e.g. `clientView.book` / a consumer booking flow) that actually holds and books
  net-rate inventory end-to-end, with markup/pricing semantics decided for the consumer path,
  L3 state-conservation tests on failure paths, and live validation. **Highest priority** — it
  is the promise the landing page already makes and the campaign's headline deliverable.
- **[FEAT-2] Consumer self-serve AI planner (GOAL D2.3).** Offer the same budget-aware engine
  the agents use, self-serve, on the traveler surface — chat-first per Deliverable 3. Today
  planning lives only under `(workspace)` (agent org required).
- **[FEAT-3] A real signed-in traveler home (replaces the `/view` placeholder).** A landing that
  actually routes a signed-in traveler to My Trips, plan-a-trip, and discovery — instead of a
  static card.
- **[FEAT-4] Consumer What's-Hot discovery feed (GOAL D2.2, PRD §9.7).** A bookable,
  agent-connected feed on the consumer surface. Today `/discover` is agent-gated (membership
  required) — there is no consumer discovery.
- **[FEAT-5] Traveler acting on a marketplace itinerary (GOAL D2.7).** Book as-is / fork / edit
  and either request-an-agent or self-book. Requires FEAT-1. (`marketplace × web/api × client`
  remain untested — a traveler cannot reach the marketplace today.)
- **[FEAT-6] Group trips for travelers (GOAL D2.5/D2.6).** Create/post/join, in-group chat,
  all-parties confirmation, identity-gated premium membership. Out of this scenario's scope;
  noted so triage sees the full D2 gap map. (Group-travel exists under `(workspace)`, agent-only.)

## Improvements
- **[IMP-1] Align the self-drive interim copy** so "Book it myself" doesn't tell a self-driving
  traveler to "reach out to your travel agent" — until FEAT-1 lands, point at a concrete next
  step (e.g., emailed itinerary / booking checklist) rather than the handoff path.
- **[IMP-2] Reconcile the account's value prop** across `/for-travelers` (plan a trip) and the
  sign-in/up copy (autofill helper), or gate the "plan a trip" promise behind the planner
  actually shipping.

## Tests Added
- **`scenarios/incubating/traveler-self-book-attempt/scenario.mjs`** — L3, 4-layer (real HTTP
  against the built compose image → parsed responses → Postgres ground truth → state-delta
  assertions), **29 checks, all pass** against the live stack. Proves: the traveler can
  read/attach/handoff a shared trip, but **cannot self-book** (no client procedure, agent path
  FORBIDDEN, zero `booking_component` delta), and the handoff **does** persist a
  `trip_handoff_request`. Includes the companion live-browser (Playwright MCP) evidence summary
  in its header.
- **Coverage matrix regenerated** (`node scripts/kitchenloop/derive-coverage.mjs`) → **31/36
  (86.1%)**. Net-new combo: **`booking × web × client = fail`** (the self-book stub — the
  campaign's key gap now flagged in the matrix). Re-verified: **`trust × api × client = pass`**
  (org-less traveler refused all agent procedures; handoff is the only write). The jump from the
  on-disk 28 to 31 is the derive tool self-healing prior REGRESS-ARTIFACT-LOSS drift (iter-6
  scenario/e2e blocks that were never re-derived into the committed matrix) — not a
  double-count; the tool validated all blocks cleanly.

## Outcome
**SUCCESS** — the composition journey completed end-to-end and surfaced the campaign's marquee
gap with hard, reproducible, mechanically-witnessed evidence. The client surface's *plumbing*
(account, shared-trip view, trip-history, handoff, trust boundary) is solid; its *self-serve
value* (plan → self-book, discover) is not yet built. The single most important, campaign-
aligned finding is **BUG-1 / FEAT-1**: "Book it myself" is a stub and no traveler can book
through the platform — a money-path build that the landing page already promises. All findings
sit inside the operator-authorized P2 campaign scope; none are out-of-phase.
