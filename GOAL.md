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

## Inputs & architecture grounding (PRD → tech architecture → MVP)

Every ticket is grounded in this order before a line is written — the loop routes
feature work through SDD (`/speckit-specify → /speckit-plan → /speckit-tasks →
/speckit-implement`), and the plan MUST cite these inputs and pass the
Constitution Check:

1. **PRD — what & why (product source of truth):**
   `docs/product/Trellis_Product_Charter_PRD.pdf` (Charter+PRD v0.3), plus the
   agent-readable feasibility digest
   `docs/product/Trellis_Feasibility_Study_v0.1_digest.md`. Defines the two
   surfaces, personas, the four pillars (Build/Book/Trade/Consumer), the P0–P3
   roadmap, and the North Star (**GBV**). The consumer surface this campaign
   builds is the PRD's **P2** surface, pulled forward by operator decision.

2. **Constitution — the immutable rules:** `.specify/memory/constitution.md`
   (v1.1.0) — the six principles (Marketplace-First, Agent-Experience-Is-the-
   Wedge, Budget-Aware-AI, Canonical Itinerary Schema, Integrate-Supply, Trust/
   Provenance/Revenue-Share) and the MVP scope discipline. The plan's
   Constitution Check gates the design.

3. **Tech architecture — how (the build shape):**
   `docs/architecture/system-architecture.md` — the system map (two surfaces on
   one shared engine, §1.1), the stack (**ADR-0001**: Next.js + Expo turborepo,
   tRPC, Better Auth on Postgres/Drizzle, Anthropic Claude SDK behind an
   LLMPort; ADR-0002/0003/0004), and the **numbered invariants INV-NNN (§3)** —
   schema & data, supply & booking, money, AI, identity/RBAC, caching, live
   verification, deployment/runtime. All new code MUST conform to these
   invariants and the layer boundaries in
   `.claude/skills/typescript-clean-architecture/SKILL.md`.

4. **Then the MVP slice.** With PRD intent + architecture invariants in hand, the
   ticket implements the smallest correct slice toward the goal, with L3 tests on
   money paths and live validation each cycle.

**Sealed-regulator note:** the architecture doc and constitution are sealed — the
loop may not amend them autonomously. A ticket that needs new cross-feature
structure (e.g. **group trips**) MUST *propose* a new invariant / schema note in
its plan; only an operator gate lands it (DIRECTIVE §2).

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
