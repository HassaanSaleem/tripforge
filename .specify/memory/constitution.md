<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.1.0 (MINOR — principles materially expanded, sections
added; none removed or redefined incompatibly)
Rationale: Re-anchored to the authoritative Product Charter & PRD v0.3
("Trellis_Product_Charter_PRD.pdf", July 2026), which supersedes the original
PMF brief (removed from the repo by the owner). The PRD adds a fourth product
pillar (consumer surface), budget-aware planning as the core AI requirement,
an expanded bookable component map, explicit non-goals, GBV as North Star, and
compliance constraints.

Modified principles:
- III "AI as a Margin Lever, Not a Feature" — budget-aware, live-priced
  planning elevated to the core AI capability
- V "Integrate Supply, Don't Contract It" — expanded from bedbank hotels to
  the full bookable component map with quote-then-book realities
- I "Marketplace-First Product Strategy" — consumer-surface-feeds-marketplace
  doctrine added
Added sections:
- Non-Goals (Explicitly Out of Scope)
- Compliance & Content Sourcing
Changed sections:
- Preamble (two surfaces, four pillars, naming note)
- MVP Scope Discipline (P0–P3 roadmap phases from PRD §11)
- Governance (North Star metric + success metrics from PRD §12)

Templates status: no template changes required (plan-template's Constitution
Check gate is dynamic; spec/tasks/checklist templates carry no constitution-
specific references).

Deferred TODOs: none
Source: docs/product/Trellis_Product_Charter_PRD.pdf (Charter+PRD v0.3, Draft,
July 2026, owner Syed Hassaan Saleem)
-->

# TripForge Constitution

> **Naming note:** "TripForge" is this repo's working name; the PRD's working
> codename is **Trellis**. Both are placeholders — "TripForge" is trademark-
> encumbered (active US LLC + live sites) and a trademark/domain search is
> required before public naming. Code and docs use the repo name until the
> operator lands a final name.

TripForge is an AI-native travel platform: **build, book, and trade trips — for
agents and travelers**. One platform, two surfaces on a shared engine:

- **Professional surface (agents):** build client-ready, budget-aware
  itineraries with AI; book net-rate inventory inline with markup control;
  list, discover, resell, and white-label finished itineraries on a two-sided
  marketplace (agent→client B2B2C and agent→agent B2B2B).
- **Consumer surface (travelers, roadmap P2):** describe a trip and a budget;
  AI assembles a live-priced, bookable itinerary; the traveler self-drives the
  bookings or hands off to a marketplace agent. The consumer surface is powered
  by the same inventory and by agent-built marketplace itineraries.

Four product pillars: **Build** (AI planning), **Book** (inventory), **Trade**
(marketplace), **Consumer surface**. The shared engine: AI itinerary
generation, a budget allocator, a unified inventory/booking layer, identity
and payments, and the marketplace catalogue.

**North Star metric: GBV — booked trip value flowing through the platform.**
Every pillar is judged by whether it increases trips created that convert into
paid, booked travel. This constitution governs every feature specification,
plan, and implementation decision in this repository.

## Core Principles

### I. Marketplace-First Product Strategy

The trade layer (marketplace) is the moat; build and book are the wedge that
feeds it. Every feature MUST be evaluated against the question: "does this
deepen marketplace liquidity, directly or by growing the installed agent base?"
Features that serve neither the wedge nor the network MUST be rejected or
deferred. When roadmap conflicts arise, work that unlocks the resell/
white-label flows (B2B2B) takes precedence over parity features already served
by incumbents (Lato, Travefy, TravelJoy).

The consumer surface exists **to feed the marketplace, not to win a standalone
planner race** (PRD §2, §5): its "request an agent" fork routes demand to
marketplace agents, and its discovery feed must be bookable, agent-connected,
and marketplace-fed. Consumer features that do not funnel demand into the
network MUST be rejected.

**Rationale:** Incumbents are either a tool with no network, supply with no
client UX, or a consumer planner with no human-accountable execution.
TripForge's durable defensibility is two-sided liquidity plus the
human-accountable agent tier that pure AI-books-it planners cannot reach
(only ~8% of travelers are comfortable letting AI book on their behalf).

### II. Agent Experience Is the Wedge

The build layer MUST match or beat the leading itinerary tools on speed and
polish — it is the acquisition hook that earns the right to build the network.
Agent-facing workflows MUST be measured against time-to-client-ready-itinerary,
and no release may regress it. The client-facing output (branded proposals,
trip app) MUST always look like the agent's brand, never TripForge's:
white-label presentation is a first-class requirement, not a skin.

**Rationale:** The SaaS-enabled-marketplace playbook only works if the tool
alone justifies adoption ("land with the tool, convert to a network"). An
empty marketplace attached to a mediocre builder wins neither side.

### III. Budget-Aware AI, Priced Against Reality

AI capabilities MUST be tied to a measurable economic outcome, and the core AI
capability is **budget-aware planning against live-priced, bookable inventory**
(PRD §9.1–9.2): the planner takes destination(s), dates, party size, trip
style, and a total budget (hard cap or target), allocates the budget across
categories (flights/transport, accommodation, activities, local transport,
buffer), pulls live options per category, and assembles to fit — re-balancing
when a category runs over, with a visible per-category and per-day breakdown.
Static suggestions that are not priced and bookable are prohibited as planner
output. Other AI levers — per-category markup/pricing suggestions, listing
quality scoring, resale-match recommendations — MUST each state the metric
they move and how it is observed. AI output presented to a client MUST be
reviewable and editable by the agent — the agent stays the author of record.
AI curates and personalizes content; it MUST NOT fabricate place imagery or
pass generated visuals off as real photos.

**Rationale:** Consumer planners produce pretty itineraries that are not
priced against real inventory and cannot be executed end-to-end; several claim
budget-awareness but execute it poorly. Reliable budget-fit against live
inventory is the differentiation, and it is measured by plan→book conversion.

### IV. Canonical Itinerary Schema

The itinerary is the platform's core entity and MUST be represented by one
standardized, versioned schema that flows unchanged through all layers and
both surfaces: built in the builder, priced by the budget allocator, booked
against inventory, and listed, licensed, resold, or white-labeled on the
marketplace (PRD §9.1: "the same trip can be booked, listed, resold, and
white-labeled"). No layer may fork or privately extend the itinerary model;
schema changes follow the amendment-style review in the Development Workflow
section. Provenance fields (original author, license terms, revenue-share
obligations, rebrand lineage) are part of the schema, not an afterthought.

**Rationale:** A trip that cannot move losslessly from build to book to trade
— and later to the consumer surface — breaks the entire product thesis.

### V. Integrate Supply, Don't Contract It

Inventory (Layer 2) MUST be sourced through aggregator APIs behind
supplier-agnostic adapter boundaries, per the PRD §9.3 bookable component map:

- **Hotels** — bedbank APIs (RateHawk/Hotelbeds/TBO/WebBeds class); net rates;
  primary margin driver. MVP.
- **Activities/tickets** — Viator/GetYourGuide/Tiqets/Klook class. MVP.
- **Car rental** — CarTrawler-type/GDS. MVP.
- **Transfers/private driver** — Mozio/Jayride/HolidayTaxis class. MVP.
- **Flights** — deep-link only at first (Duffel/Amadeus-class deferred);
  flights are the budget anchor, not a profit line.
- **Short-term rentals** — property-manager channels later; **never Airbnb API**.
- **Insurance/eSIM** — affiliate partners (high-margin add-ons).

No itinerary, marketplace, or client-facing code may depend on a specific
supplier's API shapes; swapping or adding a supplier MUST NOT require changes
outside its adapter. Direct supplier contracting is deferred until volume
justifies it (roadmap P3). The booking layer MUST be designed for the
engineering realities of §9.2/§9.4: quote-then-book with price hold/expiry and
re-quote on expiry, multi-currency with transparent conversion, multi-supplier
carts with partial-failure handling (one component fails, others hold), and an
explicit merchant-of-record decision per component — it drives payments,
refunds, and liability design.

**Rationale:** Aggregator dependence is a known margin and continuity risk;
the adapter boundary keeps it swappable. The booking/ops layer is a larger
build than the AI itself — designing for volatility and partial failure from
day one is what makes the planner's output genuinely bookable.

### VI. Trust, Provenance & Revenue-Share Integrity

Marketplace features MUST enforce trust mechanically, not by policy documents:
verified-seller status, ratings, client-ownership controls on resold trips,
per-seller control over who may resell and at what terms, and revenue-share
terms MUST be encoded and enforced in the transaction path. A resale or
white-label flow that cannot guarantee the original seller's revenue share and
the reseller's client ownership MUST NOT ship. Money paths (payments,
take-rate, booking margin, commission capture, consumer handoff fees) require
integration tests against real provider sandboxes before release —
unit-test-only coverage is insufficient.

**Rationale:** Channel conflict (fear of client poaching) is a top adoption
risk; agents will only list inventory into a network whose protections are
enforced by the platform itself.

## Non-Goals (Explicitly Out of Scope — PRD §5)

- **No ride-hailing / driver fleet.** Ground transport integrates licensed
  third-party transfer providers; a real-time mobility marketplace is a
  separate, heavily-regulated company.
- **No merchant-of-record for flights early.** Near-zero margin, high support
  load; deep-link or defer until ops maturity justifies it.
- **No Airbnb-sourced inventory.** No open booking API and terms forbid
  resale; short-term rentals come via property-manager channels later.
- **No generic consumer trip-planning play.** The consumer surface exists to
  feed the marketplace; TripForge does not compete in the standalone
  affiliate-planner race.

Specs proposing non-goal work MUST be rejected at triage, not implemented.

## Compliance & Content Sourcing

- **Package-travel rules:** bundling accommodation + transport into one sale
  can trigger package-travel/dynamic-packaging regulation (e.g., the EU
  Package Travel Directive) with liability and insolvency-protection
  obligations. Bundling flows MUST be designed with this in mind.
- **Supplier API terms:** respect each aggregator's resale, rebranding, and
  merchant-of-record terms.
- **Payments & data:** merchant-of-record, PCI scope, and cross-border data
  handling are resolved per component, early — not retrofitted.
- **Content sourcing (discovery/feed, PRD §9.7):** licensed and real imagery
  only (Google Places Photos/Unsplash/Pexels class, official social embeds,
  authentic agent/traveler UGC). Never scrape image search results, never
  re-host third-party photos, never present AI-generated imagery as real
  place photos. AI curates, ranks, and builds clearly-labeled graphics from
  licensed inputs — it does not fabricate place footage.

## MVP Scope Discipline

Roadmap phases are fixed by PRD §11 and MUST be defended against expansion:

- **P0 — MVP (in scope now):** budget-aware AI planner priced against live
  inventory; ONE bedbank + activities + transfers + car via aggregator
  adapters; basic marketplace where vetted agents list and other agents
  license/white-label trips; ratings + revenue-share plumbing. Milestone:
  live liquidity in 1–2 destination niches.
- **P1 — Marketplace scale:** more sellers/niches; markup/pricing AI;
  provenance & revenue-share hardening.
- **P2 — Consumer surface:** self-serve AI planner with the self-drive vs
  request-agent fork; "What's Hot" discovery feed (every feed item MUST be
  actionable — tap opens a plannable, budget-priced itinerary); ancillaries;
  deep-link flights.
- **P3 — Category leadership:** direct supplier contracting where volume
  justifies; multi-region; consortium tooling; flights-as-merchant if ops
  ready.

Specs proposing P1+ items MUST be marked deferred and MUST NOT enter planning
without an explicit operator scope decision. **Beachhead:** specialist/DMC
agents (supply side) in one or two destination clusters first — catalogue
depth in a niche creates the first pocket of liquidity.

**PMF instrumentation is mandatory from v1** (PRD §12): the platform MUST
measure **GBV** (North Star), marketplace take-rate revenue per active agent,
resold-to-self-built trip ratio, and plan→book conversion (agent-handoff rate
joins at P2). Features touching trip creation, booking, or marketplace
transactions MUST emit the events these metrics need.

## Development Workflow

- **Spec-driven development:** every behavior-changing feature follows the
  Spec Kit flow — `spec.md` → `plan.md` → `tasks.md` — under `specs/`.
  Implementation MUST NOT begin before an approved spec and plan exist.
- **Constitution gate:** every plan MUST pass the Constitution Check against
  the principles above before Phase 0 research and again after Phase 1 design.
  Violations require a written complexity/deviation justification in the plan.
- **Schema changes:** any change to the canonical itinerary schema (Principle
  IV) requires a versioned migration note in the feature's plan and review by
  the project owner before merge.
- **Money-path testing:** booking, payment, take-rate, and revenue-share code
  paths require integration tests (sandbox providers) as release gates.
- **Simplicity default:** prefer the simplest design that satisfies the spec;
  YAGNI applies to anything on the P1+ roadmap or the non-goals list.

## Governance

This constitution supersedes all other development practices in this
repository. All PRs and reviews MUST verify compliance with the principles
above; deviations MUST be justified in the plan's Complexity Tracking section
or rejected. The authoritative product source is
`docs/product/Trellis_Product_Charter_PRD.pdf` (Charter+PRD v0.3); where this
constitution is silent, the PRD governs; where they conflict, this
constitution governs until amended.

**Amendment procedure:** amendments are proposed as a PR against this file,
stating the change, rationale, and version bump. The project owner
(Syed Hassaan Saleem) approves amendments. Approved amendments MUST propagate
to dependent templates (`.specify/templates/*.md`) in the same change.

**Versioning policy:** semantic versioning — MAJOR for principle removals or
redefinitions that are backward incompatible, MINOR for new principles or
materially expanded guidance, PATCH for clarifications and wording fixes.

**Compliance review:** the Constitution Check in each feature plan is the
enforcement point; a quarterly review confirms principles still match the PRD
thesis, and the PMF metrics (GBV, take-rate per active agent,
resold-to-self-built ratio, plan→book conversion) are reviewed alongside.

**Version**: 1.1.0 | **Ratified**: 2026-07-03 | **Last Amended**: 2026-07-03
