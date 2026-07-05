# Implementation Plan: Bootstrap TripForge App Skeleton

**Branch**: `001-bootstrap-app-skeleton` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-bootstrap-app-skeleton/spec.md`

## Summary

Stand up the runnable TripForge monorepo skeleton exactly as decided in ADR-0001
and `docs/architecture/system-architecture.md`: a pnpm + turborepo workspace with
`apps/web` (Next.js App Router, workspace + client-view route groups) mounting a
tRPC router whose procedures are gated by Better Auth session + organization
(agency) role/tenant middleware, backed by Postgres via Drizzle. The remaining
packages (`itinerary-schema`, `domain`, `db`, `supply-adapter`, `llm`, `shared`,
`api`) are created with their public surfaces and enough content to compile,
lint, and be boundary-checked — schema/ports/LLM are versioned **stubs** that
later seeds extend in place. Ships the test/lint/quality/CI/docker/Playwright
harness and a single `OPERATOR-DESK.md` row proposing the sealed-config wiring.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 20 (LTS; matches Next.js + docker image).

**Primary Dependencies**: Next.js (App Router), tRPC v11 (`@trpc/server`), zod,
Better Auth (`better-auth` + organization plugin), Drizzle ORM (`drizzle-orm` +
`drizzle-kit`) on `pg`, Vitest, ESLint (flat config) + `typescript-eslint`,
dependency-cruiser, knip, jscpd, `@playwright/test`. `@anthropic-ai/sdk` is
declared in `packages/llm` but not called (interface + fake only this cycle).

**Storage**: PostgreSQL (single system of record, INV-003) via docker-compose
locally; Supabase pooled connection in prod (ADR-0004, not exercised here).

**Testing**: Vitest (L1 pure units, L2 tRPC-caller contract tests); a Node L3
smoke script (real server + real Postgres, state-delta/round-trip assertions);
Playwright (L4) harness wired, browser run gated on operator config.

**Target Platform**: Web (Vercel serverless in prod per INV-028; docker-compose
built image for local + INV-027 live verification). Serverless build contract:
no in-process cross-request state, no always-on worker.

**Project Type**: Web application (monorepo: `apps/web` + `packages/*`).

**Performance Goals**: N/A for the skeleton — no user-facing latency target beyond
"boots and answers health quickly". Cost-over-latency (INV-026) applies to future
AI paths, none of which exist yet.

**Constraints**: Zero paid/external services to boot + test (INV-019); serverless
build contract (INV-028); money is integer-minor-units from day one (INV-009);
no sealed regulator file edited (DIRECTIVE ALWAYS-HALT).

**Scale/Scope**: Foundation only. ~8 workspace packages + 1 app, a handful of
procedures, ~a dozen tests. Deliberately minimal — YAGNI on anything P1+.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0 (six principles).
Must pass before implementation; re-checked after design (below).*

| Principle | Gate | Verdict |
|-----------|------|---------|
| **I. Marketplace-First** | Does this deepen liquidity or grow the agent base? | **PASS** — pure enabling foundation. It builds nothing P1+/non-goal; it is the substrate the marketplace seed (0006) and every wedge feature require. No standalone-consumer or non-goal code paths (INV-022). |
| **II. Agent Experience Is the Wedge** | Agent-fast, client-branded; white-label first-class? | **PASS** — the two route groups (workspace vs white-labeled client-view) are separated by user type at the skeleton level (INV-024/020); no platform branding is baked into the client surface. No workflow to regress yet. |
| **III. Budget-Aware AI, Priced Against Reality** | AI tied to a measurable outcome; no static unbookable output? | **PASS (N/A this cycle)** — no planner exists yet. `LLMPort` is an interface + deterministic fake; **all calls (when they exist) are constrained to `claude-haiku-4-5`** and go through the port (INV-013). No AI output is produced, so nothing static/unbookable ships. |
| **IV. Canonical Itinerary Schema** | One versioned schema, no forks/private extensions? | **PASS** — `packages/itinerary-schema` is the sole home of the itinerary type, created **versioned** (`SCHEMA_VERSION`) with provenance placeholder. No other package declares an itinerary-shaped type (INV-001), enforced by dependency-cruiser + grep. This is a stub; seed-0002 versions it forward with a migration note. |
| **V. Integrate Supply, Don't Contract It** | Supplier-agnostic ports, no leaked API shapes? | **PASS** — `packages/supply-adapter` ships the `src/ports` + `src/sandbox` boundary with no concrete supplier and no supplier API shape anywhere (INV-005). Quote-then-book realities are seed-0003's contract work; the boundary is established now so they land inside it. |
| **VI. Trust, Provenance & Revenue-Share Integrity** | Money-safe; splits enforced in the transaction path? | **PASS (foundation)** — no money path exists yet, so there is nothing to under-protect. The `Money` value type is introduced as **integer minor units + explicit currency** in `packages/domain` (INV-009/010) so every later money path inherits the safe type and pure-domain rule. |

**Non-Goals / MVP discipline**: nothing from the Non-Goals list or P1+/P2+/P3+
roadmap is implemented, not even behind a flag (INV-022, Constitution MVP
Scope Discipline). No schema **version bump** and no constitution amendment occur
(both ALWAYS-HALT) — the schema is created at its initial version, not migrated.

**Post-design re-check**: the design below introduces no new cross-feature
structure beyond what the architecture doc already names, so it proposes **no new
invariant** and needs no operator gate for architecture. All INV references are to
existing invariants. Constitution Check remains **PASS** after design.

**Complexity Tracking**: no violations — table omitted (nothing to justify).

## Project Structure

### Documentation (this feature)

```text
specs/001-bootstrap-app-skeleton/
├── spec.md              # done
├── plan.md              # this file
├── tasks.md             # dependency-ordered tasks
└── quickstart.md        # how to boot + verify the skeleton
```

### Source Code (repository root)

```text
apps/
  web/                          # Next.js App Router
    app/
      (workspace)/              # agent surface (route group) — INV-024
        page.tsx
      (client-view)/            # white-labeled traveler surface (route group)
        page.tsx
      api/health/route.ts       # real DB round-trip health probe (FR-007)
      api/trpc/[trpc]/route.ts  # tRPC HTTP handler mounting packages/api router
    lib/trpc/                   # client + server helpers
    next.config.mjs · tsconfig · package.json · Dockerfile
packages/
  shared/        # Result type, logger, typed config — leaf (INV-017)
  itinerary-schema/  # SCHEMA_VERSION + zod stub + provenance placeholder (INV-001)
  domain/        # Money value type + a pure fn (splitEvenMinorUnits) — INV-009/010
  db/            # Drizzle client + auth/org tables + tenant-scoped helper (INV-004)
  supply-adapter/    # src/ports (interfaces) + src/sandbox (boundary stub) — INV-005
  llm/           # LLMPort interface + deterministic fake (INV-013)
  api/           # tRPC root router, context, role/tenant middleware, container (INV-023)
tests/
  integration/   # L3 smoke: real server + real DB, state deltas
  e2e/           # L4 Playwright: sign-in smoke spec + config
.github/workflows/ci.yml         # lint + npm test
.dependency-cruiser.cjs          # INV-017 layer boundaries (machine-checked)
knip.json · .jscpd.json          # dead-code + duplication configs
turbo.json · pnpm-workspace.yaml · tsconfig.base.json · package.json (root)
```

**Structure Decision**: Web-application monorepo, matching
`docs/architecture/system-architecture.md` §1.2 exactly. `apps/web` holds UI + the
tRPC HTTP mount only; all business/application logic lives in `packages/*` behind
public `index.ts` surfaces. Dependencies point inward (`apps → packages`;
`domain`/`itinerary-schema`/`shared` are leaves), enforced by dependency-cruiser.

## Phased approach

- **Phase 0 (research)**: none required — the stack is operator-decided (ADR-0001);
  no open technical unknowns. Recorded here rather than in a separate research.md.
- **Phase 1 (design)**: the Project Structure above + the data model (auth/org
  tables from Better Auth's Drizzle adapter, plus the session-context shape) and
  the tRPC contract (public `health`, agent-gated `workspace.whoami`). Captured
  inline; no separate data-model.md/contracts/ needed for a skeleton of this size.
- **Phase 2 (tasks)**: see tasks.md.

## Migration / schema notes

No canonical-itinerary-schema migration occurs: the schema package is **created**
at its initial version (`SCHEMA_VERSION = "0.0.0"` stub). Better Auth's tables are
created via Drizzle as the initial migration. Any future itinerary-schema change is
a versioned migration note in that feature's plan (seed-0002), and a schema
**version bump** is ALWAYS-HALT.
