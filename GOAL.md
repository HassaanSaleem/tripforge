---
title: GOAL — current operator campaign
owner: Syed Hassaan Saleem
set: 2026-07-21
status: active
relates_to: DIRECTIVE.md (setpoint) · .specify/memory/constitution.md (Principles I–VI) · docs/product/Trellis_Product_Charter_PRD.pdf (§9 pillars, §11 roadmap)
---

# Goal: Make TripForge a true two-sided product — build out the client surface and lift the whole UI to premium

## Thesis

TripForge is a two-sided product — a **professional surface** for agents and a
**consumer surface** for travelers on one shared engine — but the build is
lopsided. The agent surface is deep; the client surface is barely more than a
shared-trip viewer (token view, a self-drive-vs-request-agent fork whose "book it
myself" is a stub with no server call, an optional client account, a `my-trips`
list). And the UI still reads like a Google Form. This campaign builds the
traveler surface into a first-class side of the product, adds group travel, makes
the AI builder chat-first, and lifts the whole product to a premium travel-grade
UX.

This stays inside **Constitution Principle I**: the consumer surface exists **to
feed the marketplace, not to win a standalone planner race**. Every consumer
feature funnels demand into the agent network (its request-an-agent fork routes
to marketplace agents; its discovery feed is bookable and agent-connected). Work
that drifts toward the PRD non-goal — a *generic consumer trip-planning play* — is
out of scope.

## Operator decisions (2026-07-21)

- **Scope pull-forward (operator-authorized):** the consumer/client surface (PRD
  roadmap **P2**) is pulled forward now, and **group trips** (a new capability not
  in the PRD) are **built this pass**. This is the explicit operator scope
  decision the constitution requires for P1+/P2 work.
- **Execution:** Kitchen Loop, **up to 20 iterations**, base branch
  **`campaign/two-sided-surface`** (branched off `main`).
- **No production deploy:** auto-deploy is **paused** (`.github/workflows/
  deploy.yml` `push: main` trigger disabled) and all work lands on the campaign
  branch, never `main`. The operator merges to `main` and re-enables deploy when
  satisfied.
- **Everything via PRs:** no direct commits to `main`; changes land as PRs into
  the campaign branch (loop pr-manager pipeline; setup changes via their own PR).
- **Live validation is NOT skipped:** every SDD cycle runs the full INV-027 Live
  Test & Fix browser QA + the UAT gate against the built compose image.
- **Still ALWAYS HALT for the operator:** constitution amendments, canonical
  itinerary schema version bumps/migrations, and revenue-share / client-ownership
  semantics changes (DIRECTIVE §2) — even inside this campaign.
- **Consumer self-book semantics (goal-consumer-selfbook) — RULED 2026-07-21:**
  the self-serve traveler booking is built as a **v0 that stays inside existing
  money math**, so it does NOT trip the ALWAYS-HALT — build it now:
  - **Ownership:** the trip stays owned by the **originating agency** (the share
    token is an agency itinerary); attach the signed-in traveler via the existing
    P2 client↔trip association (INV-020: traveler sees the **sell price only**,
    never net/markup). No traveler-owner association, **no canonical-schema
    change**.
  - **Money:** the traveler pays the agency's **existing marked-up sell price**;
    the **agency keeps the markup**; reuse `markup_ledger` unchanged. **No
    platform take-rate on self-serve in v0; no revenue-share formula change.**
  - **Shape:** a token-scoped `clientView.book` procedure over the existing
    agency-scoped booking path; L3 money-path + conservation tests + live
    validation mandatory. Traveler-owned bookings and any platform take-rate are
    **deferred** to a future operator decision (would each be a schema /
    revenue-share change that re-halts).
- **Marketplace fork/white-label semantics (goal-marketplace-fork-whitelabel) —
  RULED 2026-07-27:** build a **v0 that stays inside existing money math** (mirrors
  the `goal-consumer-selfbook` ruling), deferring every new payout/ownership change
  to a P1 operator decision. Operator (Hassaan) ratified the loop's
  `MARKETPLACE-FORK-SEMANTICS` recommendation via AskUserQuestion ("Build safe-v0"):
  - **(a) Fork** = an **agency-owned** copy (originating/seller agency), **no
    traveler-owner**; attach the signed-in traveler via the existing
    `client_trip_link` (INV-020 sell-price-only). **No canonical-schema change.**
  - **(b) Book a listing as-is** = the traveler pays the seller's **existing
    marked-up sell price**; the seller keeps the markup via `markup_ledger`
    unchanged; **NO new platform take-rate** on direct traveler booking at v0.
  - **(c) Resale revenue-share payout** = keep the **two-way** split at v0; the
    three-way original-author payout stays **deferred** (ruled together with the
    open `RESALE-SHARE-SEMANTICS` row — still open). The "earn a share on every
    resale" copy is already softened (PR #44).
  - **(d) Add-my-client-to-another-agent's departure** = add an **opt-in
    `joinable` flag + vetting gate** on agent departures (additive, backfill-free
    column, SCHEMA-GATE-78 discipline, **no `SCHEMA_VERSION` bump**); the joined
    client stays the **joining agent's** (no ownership transfer), **no per-seat
    revenue split** at v0.
  - **Mandatory:** full SDD flow under these bounds; **L3 money-path +
    conservation tests + live validation**; the PR stays **operator-gated at
    merge**. Any step that would exceed these bounds (a new take-rate, a resale
    payout, a traveler-owner, or a cross-agent ownership transfer) **re-halts** for
    the operator.

## Deliverable 1 — Landing pages (global + travelers + agents) with demo videos

Assets are staged in `apps/web/public/`: `demos/tripforge-clients.mp4`,
`demos/tripforge-agents.mp4`, and stills under `shots/`.

- **One global landing page** — the product overview, both sides represented,
  with a clear split to the traveler and agent stories.
- **A travelers page** (`/for-travelers`) — the consumer story, embedding
  `demos/tripforge-clients.mp4`.
- **An agents page** (`/for-agents`) — the professional story, embedding
  `demos/tripforge-agents.mp4`.
- Premium, responsive, theme-aware; real imagery only (Compliance & Content
  Sourcing); nav links the three pages plus traveler/agent sign-in.

## Deliverable 2 — What a traveler (client) must be able to do

1. **Sign up and sign in** — a full self-serve traveler account, not just the
   token-scoped identity that exists today.
2. **See what's hot** — a "What's Hot" discovery feed on the consumer surface
   (PRD §9.7). Every feed item is actionable — tapping one opens a plannable,
   budget-priced, bookable itinerary connected to an agent/the marketplace.
3. **Plan a trip with our AI** — the same budget-aware engine the agents use
   (Principle III), offered self-serve.
4. **Book the trip** — the planner surfaces concrete, bookable recommendations
   (which flight/airline, which hotels) alongside trip advisories (mountainous or
   off-road terrain, altitude, security risk, local tips), and the traveler
   self-books end-to-end through the platform. Today "book it myself" is a
   confirmation-only stub — make it real. Money path: L3 sandbox tests +
   live validation mandatory (Principle VI).
5. **Plan group trips** — create a group, post it, let others join, finalize
   collectively. Trust/safety is planned for, not deferred: in-group chat,
   confirmation from all parties before finalizing, and gating so **only
   verified, identity-validated premium members may post or join** (Principle VI,
   trust enforced mechanically; plus the identity/data compliance posture).
6. **Join group trips already running** — including agent-hosted departures.
7. **Act on a marketplace itinerary** — book as-is, or fork/edit it and either
   **request the agent to host/book it** or **self-book it through the platform**.
   Fork/resale/client-ownership/revenue-share semantics are governed by Principle
   VI; changing those semantics ALWAYS HALTS (DIRECTIVE §2).

## Deliverable 3 — AI builder is chat-first (both surfaces)

The AI builder is **conversational-first**, not form-first. A chat fills the same
fields the form collects; the form stays available. The trip is built in the
chat, and **once the itinerary has what it needs, the flow proceeds into the
booking workflow.** Same conversational build for agents and travelers on the
shared engine.

> Current state: chat exists on the agent surface as an *adjunct* to the form (a
> chat-first entry, spec 028; conversational editing, demo-03) that hands off to
> the same draft flow. Promote chat to the **primary build-to-book path** and
> bring it to the consumer surface.

## Deliverable 4 — Agent marketplace as the trade layer

Agents finish a trip and **publish it to the marketplace** (Principle I, the
moat):

- **White-label an entire trip** when a matching offering already exists.
- **Add their own clients into another agent's group departure** when a seat is
  available and that agent has listed the departure as joinable.

## Deliverable 5 — The UI must stop looking like a Google Form

Stacked labels and inputs with no craft must become a premium travel product on
both surfaces. UX, not just markup: reduce forms to a conversation and a few
deliberate choices, use real imagery and a considered visual system, and make
plan → book feel guided rather than filled-in (Principle II: the build layer must
match or beat the leading tools on **speed and polish** — polish is first-class).

## Invariants this campaign must hold

- **Canonical schema (Principle IV).** Client-planned trips, group trips, and
  forked marketplace trips are all the **same versioned itinerary entity** — no
  layer forks or privately extends the model.
- **Feed the marketplace (Principle I).** Every consumer feature funnels demand
  into the agent network; none drifts into the generic-consumer-planner non-goal.
- **Trust is mechanical (Principle VI).** Group-trip identity validation and
  premium gating, and the resale/white-label/revenue-share path, are enforced in
  the transaction path, not in policy docs.
- **Money paths gated.** Self-serve booking and any handoff fee require L3
  integration tests with state-conservation assertions on failure paths, plus
  live validation.
- **Operator gates still halt.** Constitution/schema/revenue-share/
  client-ownership changes go through the operator — not loop commits.
