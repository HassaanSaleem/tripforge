# CLAUDE.md

This file provides guidance to Claude Code when working in the TripForge repository.

## What This Repo Is

TripForge (PRD codename **Trellis** — both placeholders pending trademark
clearance) — an AI-native travel platform: build, book, and trade trips, for
agents and travelers. Two surfaces on a shared engine: the **professional
surface** (budget-aware AI itinerary builder, inline net-rate booking with
markup control, and a two-sided agent marketplace with resale/white-label) and
the **consumer surface** (roadmap P2: self-serve AI planner with a
self-drive-or-request-agent fork, feeding the marketplace). North Star metric:
**GBV** — booked trip value through the platform.

Source of truth for the product: `docs/product/Trellis_Product_Charter_PRD.pdf`
(Charter+PRD v0.3). This is a standalone git repository (nested under the
GrowthAnts monorepo directory but independent of it).

## Governance

- **Architecture**: `docs/architecture/system-architecture.md` — system map,
  tech stack (ADR-0001: Next.js + Expo turborepo, tRPC, Better Auth on
  Postgres/Drizzle, Anthropic Claude SDK behind LLMPort, docker-compose
  local), and numbered
  invariants (INV-NNN). Part of the sealed regulator: feature plans propose
  invariants, only operator gates land them. Review DRIFT findings cite
  invariant IDs.
- **Constitution**: `.specify/memory/constitution.md` (v1.1.0, anchored to the
  PRD) — six principles govern every change: Marketplace-First (consumer
  surface feeds the marketplace), Agent Experience Is the Wedge, Budget-Aware
  AI Priced Against Reality, Canonical Itinerary Schema, Integrate Supply
  Don't Contract It (full component map + quote-then-book realities), and
  Trust/Provenance/Revenue-Share Integrity. Plans MUST pass the Constitution
  Check. Roadmap discipline: P0 = agent-side MVP only; P1+ items and the PRD
  non-goals (ride-hailing fleet, flights merchant-of-record early, Airbnb
  inventory, generic consumer planner) are out of scope without an operator
  decision.

## Development Model: Kitchen Loop over SDD

This repo is developed by an autonomous improvement loop (the Kitchen Loop,
arXiv:2603.25697) whose Execute phase routes feature work through Spec-Driven
Development (Spec Kit).

### Spec-Driven Development (features)

Feature-sized work follows: `/speckit-specify` → `/speckit-plan` →
`/speckit-tasks` → `/speckit-implement`. Specs live under `specs/`.
Plans must pass the Constitution Check before implementation.

### Kitchen Loop (the outer loop)

- Config: `kitchenloop.yaml` (spec surface dimensions, oracle commands, gates)
- Run one iteration: `./scripts/kitchenloop/kitchenloop.sh 1`
- Phases: Backlog → Ideate → Triage → Execute → Polish → Regress
- Skills: `.claude/skills/kitchenloop-*` — the Execute skill contains the
  SDD routing rules (feature-sized → Spec Kit; bug-sized → direct fix + repro test)
- State: `docs/internal/loop-state.md`, coverage in
  `.kitchenloop/coverage-matrix.yaml`, tickets in `.kitchenloop/backlog.json`
  (local provider), known-broken combos in `.kitchenloop/blocked-combos.yaml`
- Quality gate: `.kitchenloop/quality-bar.md` — includes "The Bar" (five
  TripForge domain principles). L3 integration tests are mandatory for
  integration points and money paths; see `.kitchenloop/unbeatable-tests.md`.
- Live Test & Fix gate (INV-027, ADR-0003): every SDD cycle that changes
  product behavior ends with live verification against the built compose
  image — QA browser journey (Playwright/Playwright MCP) with per-step
  screenshots, compose-log scan, defects fixed in the same cycle. Evidence
  lands in `.kitchenloop/evidence/` (git-ignored); the PR body carries the
  verdict in a Live Test Evidence section.
- UAT gate: sealed test cards in `.kitchenloop/uat-cards/`, evaluated by the
  fresh zero-context `uat-evaluator` agent (`.claude/agents/uat-evaluator.md`)
  driving the live stack in a real browser (Playwright MCP, screenshots)

### Operator Control Plane (read before any loop work)

- **`DIRECTIVE.md`** — the human setpoint. Read it at the start of every loop
  phase. It grants autonomy per work class and lists what ALWAYS halts
  (constitution/schema/money-semantics changes, gate changes, push, deploy).
  Only Hassaan edits it.
- **`OPERATOR-DESK.md`** — the single asks-channel. Every halt-for-the-operator
  is one row with the exact word to say. A gate that is not on the desk was not
  asked. Never bury an ask in prose, a PR comment, or chat.
- **HALT sentinel** — if `.kitchenloop/HALT` exists, every loop phase refuses to
  run until the operator deletes it. Any phase may create it (with a reason
  inside) when drift metrics or stop conditions trip.
- **Sealed regulator** — the loop may not modify its own gates: quality bar,
  regression oracle definitions, UAT protocol, quality-sweep rules, DIRECTIVE,
  or the pr-manager review stages. Changes to these are operator gates (desk
  row), never loop commits. The regulator is not modifiable by what it regulates.
- **Proof-carrying claims** — "done" requires evidence: a command output, a test
  run, a UAT card verdict. A claim without a witness is a proposal, not a result.

### Clean Code Policy

All TypeScript follows `.claude/skills/typescript-clean-architecture/SKILL.md`:
layer boundaries (canonical schema package, supply-adapter isolation, pure
domain money math in integer minor units), Pre-Write Discipline
(reuse/extend/generalize/new recorded in every PR), extraction thresholds, and
deletion discipline. Every 3rd iteration the Regress phase runs the quality
sweep (`kitchenloop-quality-sweep`): dead code, duplication, completeness,
compactness, boundary conformance → improvement tickets.

### Rules for any agent working here

- Never weaken a test assertion, edit a sealed UAT card after evaluation, or
  mark a coverage cell tested without a passing scenario — honesty is enforced
  mechanically, don't fight it.
- Money paths (booking, markup, take-rate, revenue share) require L3
  integration tests with state-conservation assertions on failure paths.
- The canonical itinerary schema may only be changed with a versioned
  migration note in the feature plan.
- No supplier API shapes outside the supply adapter boundary.
- Review gates check code ↔ spec ↔ architecture alignment (VIOLATION /
  CODE-MISSING / DRIFT / CODE-AHEAD block; SPEC-SILENT files a spec-amendment
  ticket — code never silently defines the spec).

## Commands

```bash
npm test           # L1/L2 tests (once the skeleton exists — see seed-0001)
npm run lint       # ESLint
./scripts/kitchenloop/kitchenloop.sh 1          # one loop iteration
./scripts/kitchenloop/kitchenloop.sh 10         # overnight batch
tail -f .kitchenloop/logs/*.log                 # monitor
```

## Bootstrap Status

The app skeleton does not exist yet. The seeded backlog
(`.kitchenloop/backlog.json`) orders the bootstrap (ID order = build order):
app skeleton (seed-0001) → canonical itinerary schema v0 (seed-0002) →
supply-adapter port family + sandbox mocks (seed-0003) → L3 regression oracle
harness (seed-0004) → budget allocator + quote-then-book flow (seed-0005). A
sixth seed, marketplace v0 (seed-0006: list/license/white-label + revenue-share
plumbing), builds toward the P0 liquidity milestone (Constitution I/VI). Later
seeds declare their `Depends on:` predecessors in-body (0002-0005 depend on
0001; 0005 also on 0002/0003/0004). Until the skeleton lands,
`npm test`/`npm run lint` will fail — that is expected; the first Execute
iteration creates them.
