# TripForge System Architecture

**Status:** Active · **Owner:** Syed Hassaan Saleem · **Last amended:** 2026-07-03
**Sources:** `docs/product/Trellis_Product_Charter_PRD.pdf` (v0.3) · Constitution v1.1.0
**Governance:** This document is part of the sealed regulator — the loop may not
amend it autonomously. Feature plans (`/speckit-plan`) that introduce new
cross-feature structure MUST propose a new invariant here in the same PR, which
lands only through an operator gate. Review DRIFT findings cite invariant IDs
(INV-NNN) from §3.

---

## 1. System map

### 1.1 Contexts (PRD §4 — one platform, two surfaces on a shared engine)

```
┌────────────────────────┐          ┌────────────────────────┐
│  Professional surface  │          │  Consumer surface (P2) │
│  web (Next.js)         │          │  self-serve planner    │
│  mobile (Expo RN)      │          │  self-drive / agent    │
└─────────┬──────────────┘          └─────────┬──────────────┘
          │        tRPC (zod-typed procedures)│
┌─────────▼──────────────────────────────────▼──────────────┐
│                      SHARED ENGINE                         │
│  AI itinerary generation · Budget allocator                │
│  Unified inventory/booking layer (supply ports)            │
│  Identity & payments · Marketplace catalogue               │
└─────────┬──────────────────────────────────┬──────────────┘
          │                                  │
   ┌──────▼──────┐                    ┌──────▼──────────────┐
   │ PostgreSQL  │                    │ External aggregators │
   │ (system of  │                    │ via adapters: hotels,│
   │  record)    │                    │ activities, transfers│
   └─────────────┘                    │ car · LLM provider   │
                                      └──────────────────────┘
```

### 1.2 Monorepo containers (pnpm + turborepo)

| Container | What it is | Depends on |
|-----------|-----------|------------|
| `apps/web` | Next.js — two route groups with distinct experiences: agency **workspace** (agents) and white-labeled **client views** (travelers); mounts the tRPC router | `packages/*` public surfaces |
| `apps/mobile` | Expo React Native — agent mobile app; consumes the same tRPC router over HTTP | `packages/api` client, `packages/itinerary-schema` |
| `packages/api` | tRPC routers + procedures (application layer); framework-agnostic | `domain`, `db`, ports |
| `packages/itinerary-schema` | THE canonical itinerary schema — zod + TS types + versioning + provenance | *(leaf)* |
| `packages/domain` | Pure business logic: budget allocator, pricing/markup, revenue-share math | `itinerary-schema` |
| `packages/db` | Drizzle schema + client (PostgreSQL); tenant-scoped query helpers | `itinerary-schema` |
| `packages/marketplace` | Listing/licensing/white-label orchestration | `domain`, `itinerary-schema`, ports |
| `packages/supply-adapter` | Supply ports (hotel/activity/transfer/car) + sandbox mocks + real aggregators later | `itinerary-schema` |
| `packages/llm` | LLMPort + official Anthropic SDK implementation (tool use, structured outputs; metered) | `shared` |
| `packages/shared` | Logging, config, Result types | *(leaf)* |

### 1.3 Technology stack (operator-decided 2026-07-03 — see ADR-0001)

| Concern | Choice | Notes |
|---------|--------|-------|
| Web | **Next.js** (App Router) | polished UI priority |
| Mobile | **Expo React Native** | same TS monorepo, shared packages |
| API | **tRPC** with zod I/O | REST facade deferred until partner APIs needed |
| Database | **PostgreSQL** (single system of record) | via **Drizzle** ORM *(suggested default)* |
| Auth | **Better Auth** on platform Postgres | org plugin = agency multi-tenancy |
| LLM | **Anthropic Claude SDK** (`@anthropic-ai/sdk`) behind `LLMPort` | Claude API in dev + prod (`ANTHROPIC_API_KEY`); deterministic fakes in tests |
| UI kit | **Tailwind + shadcn/ui** (web), NativeWind (mobile) *(suggested default)* | |
| Testing | Vitest (L1/L2) · tRPC caller + Postgres (L3) · Playwright (L4) | per unbeatable-tests |
| Local boot | **docker-compose** (postgres, mailpit) + `pnpm dev`; `ANTHROPIC_API_KEY` in `.env` for AI features | INV-019 |
| Payments | Deferred — mock `PaymentsPort` until marketplace transactions land | MoR per component is an open PRD question |

Everything open-source/free for now (operator constraint). Simple by design:
CRUD-dominant, simple LLM calls, no background-job infrastructure until a
feature plan proves the need (then pg-boss on the same Postgres — no new broker).

### 1.4 Identity & access model (RBAC)

Two user types with **different product experiences** (operator directive
2026-07-03):

| User type | Identity | Experience | P0 scope |
|-----------|----------|-----------|----------|
| **Agent** | Member of an agency (Better Auth **organization**) with an org role: `owner` / `admin` / `member` | Agency workspace (web + mobile): build, book, price, list, resell | Full |
| **Traveler / customer** | Standalone user (no organization) | White-labeled client experience: view trip, approve, pay — under the agent's brand | View/approve via share links or lightweight account; full self-serve planner is P2 |

- Agency org roles gate administration: `owner`/`admin` manage members, billing,
  markup policy; `member` builds and sells. Kept to these three at MVP.
- Marketplace **seller** and **reseller** are relationships between agencies on
  a listing, not auth roles — they're modeled in the marketplace domain, and
  provenance/revenue-share enforcement (INV-012) does the gating.
- Roles live in the session context and are enforced per tRPC procedure
  (INV-023) — never by hiding UI.

---

## 2. Core flows (reference for reviewers)

1. **Build:** agent describes trip + budget → `domain.budgetAllocator` splits by
   category → planner drafts via `LLMPort` + prices via supply ports → itinerary
   (canonical schema) persisted with per-category/per-day breakdown → agent edits
   → branded client view/share.
2. **Book:** itinerary component → quote via supply port (hold + expiry) → cart
   assembly (multi-supplier) → book each component; partial failure holds the
   rest → ledger rows (markup, commission) written transactionally.
3. **Trade:** seller lists itinerary (provenance + license terms + resale
   controls) → buyer agent licenses/white-labels → revenue-share split computed
   in `domain`, recorded in the same transaction as the license → ratings.

---

## 3. Architectural invariants

Each invariant is testable and traceable. DRIFT findings cite these IDs.
`[M]` = machine-checked (dependency-cruiser / lint / oracle); others are
review-checked and L3-tested where marked.

### Schema & data

- **INV-001 [M]** All itinerary data crossing any boundary (API, DB, marketplace,
  supply ports) validates against `packages/itinerary-schema`. No other package
  declares an itinerary-shaped type. *(Constitution IV, PRD §9.1)*
- **INV-002** The schema is versioned; marketplace-listed itineraries carry
  mandatory provenance: original author, license terms, revenue-share
  obligations, rebrand lineage. *(Constitution IV/VI)*
- **INV-003** PostgreSQL is the single system of record. No second datastore
  (cache, search, vector) without an ADR and operator gate.
- **INV-004 [M]** Every tenant-owned table carries the owning `agencyId`
  (Better Auth organization); every query path filters by tenant. A handler
  that ignores tenancy is a bug, not a style issue.

### Supply & booking

- **INV-005 [M]** Inventory is reached only through ports in
  `packages/supply-adapter`; no supplier API shape appears outside it.
  *(Constitution V)*
- **INV-006** Quote-then-book: every booking references a quote with an explicit
  expiry; an expired quote re-quotes — it never books silently at a changed
  price. *(PRD §9.4; L3-tested)*
- **INV-007** Multi-supplier carts handle partial failure: one component failing
  leaves the others held, never silently dropped or auto-cancelled.
  *(PRD §9.4; L3-tested)*
- **INV-008** Flights are deep-link only; no flights merchant-of-record code
  path. Short-term rentals never via Airbnb API. *(PRD non-goals)*

### Money

- **INV-009 [M]** Money is integer minor units + explicit currency everywhere;
  conversions are explicit, logged operations. *(Constitution VI)*
- **INV-010 [M]** Markup, take-rate, and revenue-share math live only in
  `packages/domain` as pure functions — never inline in handlers or UI.
- **INV-011** Every money-path failure branch asserts state conservation: no
  orphan ledger rows, no lost funds. *(Constitution VI; L3-tested)*
- **INV-012** Revenue-share and client-ownership controls execute inside the
  transaction path — a resale/license cannot complete without its recorded
  split. *(Constitution VI, PRD §9.6)*

### AI

- **INV-013 [M]** LLM calls go only through `LLMPort` (`packages/llm`), backed
  by the official Anthropic SDK (`@anthropic-ai/sdk`) — chosen for native tool
  use (tool runner), structured outputs (`messages.parse` + zod), and prompt
  caching. **All calls run on `claude-haiku-4-5` — no Opus-tier models**
  (operator decision, 2026-07-03; the model is config, so an upgrade is a
  one-line change if UAT shows drafting quality needs it). The Claude tools
  the planner needs are **defined in code** in `packages/llm/src/tools/` as
  typed definitions (zod input schemas via the SDK's `betaZodTool`, one file
  per tool), wrapping the supply ports — e.g. `search_hotel_rates`,
  `search_activities`, `quote_transfer`, `quote_car_rental`. No ad-hoc or
  runtime-assembled tool JSON. Every call is metered (tokens, purpose, model).
  The test suite runs against deterministic fakes at the `LLMPort` boundary —
  no live provider or API key required to run tests. Note: Haiku 4.5 does not
  support the `effort` parameter — do not send it.
- **INV-014** Planner output is priced against live (or sandbox) inventory via
  supply ports — never static, unbookable suggestions. *(Constitution III, PRD §9.1)*
- **INV-015** The budget allocator is a pure `packages/domain` function; its
  per-category/per-day breakdown persists with the itinerary. *(PRD §9.2)*
- **INV-016** AI output presented to a client is draft-until-agent-approves;
  the agent is the author of record. AI never fabricates place imagery.
  *(Constitution III, PRD §9.7)*

### Platform

- **INV-017 [M]** Dependency direction: `apps → packages`; `domain` imports no
  adapters; `itinerary-schema` and `shared` are leaves. Machine-checked by
  dependency-cruiser.
- **INV-018** Web and mobile consume the same tRPC router; no client reaches
  the DB or an adapter except through `packages/api` procedures.
- **INV-019 [M]** `docker compose up` + one command boots the CRUD stack and
  the full test suite locally with zero paid/external services (sandbox supply
  mocks, deterministic LLM fakes in tests, mailpit for email). AI features use
  the Claude API and require only `ANTHROPIC_API_KEY` in `.env` — no other
  paid dependency.
- **INV-020** Client-facing output carries the agent's brand only — no platform
  branding leaks into proposals or trip views. *(Constitution II)*
- **INV-021** PMF metric events (GBV, take-rate per agent, resold:self-built,
  plan→book conversion) are emitted in the same transaction as the business
  action they measure. *(Constitution, PRD §12)*
- **INV-022** No P1+/non-goal code paths land — not even behind flags — without
  an operator scope decision. *(Constitution MVP discipline)*

### Identity & RBAC

- **INV-023 [M]** Authorization is enforced per tRPC procedure by role
  middleware (traveler vs agent vs agency owner/admin) reading the Better Auth
  session + organization context. UI visibility is never the authorization
  mechanism; every procedure declares its required role.
- **INV-024** Agents and travelers get distinct surfaces: a traveler session
  can never invoke workspace procedures, and workspace UI/branding never leaks
  into the client experience (which carries the agent's brand only — INV-020).
  Route groups and navigation are separated by user type, not toggled by flags.

### Caching & derived data

- **INV-025 [M]** Expensive computed results are **computed once, served many
  times**: any LLM output or aggregator-derived content that is not
  user-specific and not price-live MUST be materialized in Postgres (the
  single system of record — INV-003; no Redis/memory cache tier without an
  ADR + operator gate) rather than recomputed per request. Derived tables
  carry **semantic cache keys** — scope + version or content hash, never blind
  global TTLs: windowed keys invalidate by period, content-hash keys by
  change. Every row records `computed_at`, the producing `model`, and its
  refresh policy. Examples:
  - `whats_hot(destination, iso_week)` — one curated computation per
    destination-week serves every user (P2 feed);
  - `listing_quality(listing_id, content_sha)` — rescored only when the
    listing's content actually changes;
  - markup/pricing suggestions per `(category, destination, season)`;
  - static supplier content (hotel descriptions, amenities, media refs)
    cached from aggregator lookups.
  Anthropic prompt caching (INV-013) complements this at the request layer
  for the stable planner prompt/tool definitions; it is not a substitute for
  data-layer materialization.
- **INV-026** The optimization target for derived/AI computation is **cost
  and output quality, not latency** (operator directive 2026-07-03): prefer
  scheduled, batched computation with richer prompts and curation passes over
  cheap per-request calls. Per-request LLM calls are reserved for genuinely
  user-specific work (drafting a specific client's trip). Periodic refresh
  runs on Postgres-native scheduling (pg-boss/pg_cron when a feature plan
  needs it — no new broker). **Carve-out: live prices are never cached beyond
  their quote hold/expiry (INV-006)** — freshness of money data is a
  correctness property, not an optimization trade-off.

### Live verification & evidence

- **INV-027 [M]** Every SDD cycle that changes product behavior ends with
  **live verification against the built artifact** (operator directive
  2026-07-03): boot the docker-compose stack from a fresh image build
  (`docker compose up --build --wait`), exercise the changed flow as a user
  would — QA-style browser journey (Playwright / Playwright MCP) for
  UI-facing changes, real HTTP against real routes for API changes — and
  review the runtime logs. Defects found live are **fixed in the same cycle**
  (fix → rebuild → re-test), never deferred to a ticket. Evidence is
  mandatory and mechanically checkable: per-step screenshots/traces plus the
  captured compose log land in `.kitchenloop/evidence/<iteration>/<ticket>/`
  (git-ignored; the PR body cites the verdict and key excerpts). A green
  unit/L2 suite without live evidence does not satisfy this invariant.
  *Pre-skeleton carve-out: until seed-0001 lands a runnable web service,
  the stage records `SKIPPED (pre-skeleton)` in the PR body — explicitly,
  never silently.* (ADR-0003)

---

## 4. Decision records

System-wide ADRs live in `docs/architecture/decisions/`; package-level ADRs
colocate with the package they constrain once it exists (STD-002 §3.5 spirit).

- **ADR-0001** — MVP technology stack (Next.js + Expo, tRPC, Better Auth,
  Drizzle/Postgres, Anthropic SDK + LLMPort, docker-compose local).
- **ADR-0002** — Postgres-backed derived-data caching (semantic keys,
  cost-over-latency batch computation, live-price carve-out).
- **ADR-0003** — Live verification per SDD cycle (built compose image as test
  target, Playwright + Playwright MCP as QA driver, screenshot/log evidence,
  fix-in-cycle policy).

## 5. Amendment process

1. A feature plan needing new cross-feature structure proposes the invariant
   (numbered, testable, traceable) in its PR.
2. The operator approves via desk gate; the invariant lands with the plan.
3. Removing or weakening an invariant is a constitution-tier event: desk gate +
   rationale recorded here and in the ADR log.
