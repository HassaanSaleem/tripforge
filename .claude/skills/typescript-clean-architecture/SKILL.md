---
name: typescript-clean-architecture
description: Conventions for building TripForge's TypeScript monorepo with clean architecture, ports-and-adapters boundaries, the canonical itinerary schema package, and money-safe patterns. Use this skill when creating a new package or app, adding routes/handlers/adapters/domain logic, or reviewing TypeScript code for architectural consistency. Mirrors the synapse-io python-fastapi-clean-architecture policy. Does NOT trigger on loop-infrastructure scripts or markdown-only work.
license: MIT
metadata:
  version: "1.0.0"
---

# TypeScript Clean Architecture — TripForge

The clean-code policy for TripForge. Every builder (human, loop Execute phase, or
subagent) follows these conventions so the codebase stays coherent across hundreds
of autonomous SDD cycles — no random files, no orphan functions, no drift.

## When to Apply

Use these guidelines when:

- Creating a new app or package in the monorepo
- Adding API routes, handlers, domain logic, adapters, or UI features
- Refactoring or reviewing TypeScript code for architectural consistency
- Deciding where a new capability should live

Skip when:

- Editing loop infrastructure (`scripts/kitchenloop/`, `scripts/pr-manager/`)
- Markdown/spec-only changes

---

## Core Engineering Principles

These precede every pattern below. If a pattern conflicts with a principle, stop
and surface the conflict.

1. **Architecture first, then data.** Trace the flow before changing any value:
   route → handler → application service → domain → adapter → external system.
2. **Study existing patterns closely.** Before writing new code, grep for how the
   repo already solves the same problem and match it. A new style is an explicit
   decision, recorded in the PR body.
3. **Never treat a component in isolation.** List every file that must change
   (schema + handler + adapter + route + test) before editing.
4. **Gather complete context before editing.** Read reference files in full;
   find every callsite before renaming. Fix all callsites in one pass.
5. **Fix root causes, not symptoms.** Never fix a bug by tweaking a constant or
   special-casing when the defect is in the logic.
6. **Confirm before destructive or shared-state actions.** Schema migrations,
   renaming public API surface, changing package boundaries.

---

## Required Monorepo Layout

Stack (ADR-0001): Next.js + Expo in a pnpm/turborepo monorepo, tRPC, Better
Auth on Postgres via Drizzle, official Anthropic SDK (`@anthropic-ai/sdk`)
behind `LLMPort` (tool use + structured outputs; fakes in tests). Authoritative
map + invariants: `docs/architecture/system-architecture.md`.

```
tripforge/
  apps/
    web/                     # Next.js — two route groups by user type (INV-024):
                             #   workspace (agents) · client views (travelers, white-label)
                             #   mounts the tRPC router; UI only — no business rules
    mobile/                  # Expo React Native agent app; same tRPC router over HTTP
  packages/
    api/                     # tRPC routers/procedures (application layer) + role
                             #   middleware (INV-023); composition root wiring
    itinerary-schema/        # THE canonical itinerary schema (Constitution IV, INV-001)
                             #   zod schemas + TS types + versioning + provenance
    domain/                  # Pure business logic: budget allocator, pricing,
                             #   revenue-share, licensing (INV-010, INV-015)
    db/                      # Drizzle schema + client; tenant-scoped query helpers (INV-004)
    supply-adapter/          # Supply ports + implementations (Constitution V, INV-005)
      src/ports/             #   hotel / activity / transfer / car port interfaces
      src/sandbox/           #   deterministic sandbox mocks
      src/<vendor>/          #   real aggregator adapters (later), one dir per supplier
    llm/                     # LLMPort + Anthropic SDK implementation, metered (INV-013)
    marketplace/             # Listing, licensing, white-label flows (uses domain/)
    shared/                  # Service-agnostic utilities (logging, config, result types)
  tests/
    integration/             # L3: real app + DB, state-delta assertions
    e2e/                     # L4: Playwright user journeys
```

### Layer Responsibilities

| Layer | Contains | Depends on |
|-------|----------|-----------|
| `apps/web` | Pages, components, client state (workspace + client-view route groups) | `packages/*` public surfaces only |
| `apps/mobile` | Expo screens/components | `packages/api` client, `itinerary-schema` |
| `packages/api` | tRPC procedures, role/tenant middleware, composition root | `domain`, `db`, ports |
| `packages/itinerary-schema` | zod schemas, types, provenance fields, versioning | *(nothing internal)* |
| `packages/domain` | Pure functions: budget allocator, pricing math, revenue splits, license terms | `itinerary-schema` |
| `packages/db` | Drizzle schema, client, tenant-scoped helpers | `itinerary-schema` |
| `packages/marketplace` | Listing/licensing/white-label orchestration | `domain`, `itinerary-schema`, ports |
| `packages/supply-adapter` | Supply ports + concrete adapters | `itinerary-schema` (nothing else) |
| `packages/llm` | LLMPort + AI SDK provider wiring, metering | `shared` |
| `packages/shared` | Logging, config, `Result`/error types | *(stdlib/3rd-party only)* |

Dependencies point inward. `domain` never imports adapters or apps. `shared` is a
leaf. **Nothing outside `packages/itinerary-schema` may declare an itinerary type**,
and **nothing outside `packages/supply-adapter` may mention a supplier's API shapes**
(Constitution IV & V — these two rules are review-blocking DRIFT).

---

## Hard Rules

### Boundaries & Validation

- **zod at every boundary** (API requests/responses, adapter inputs/outputs,
  queue messages) — one schema per endpoint, inferred TS types (`z.infer`).
- Internal state uses plain typed objects/interfaces; don't re-validate
  mid-pipeline what a boundary already validated.
- Ports (interfaces) live next to the domain that needs them; adapters implement
  them. Handlers depend on the port type, never the adapter class.

### Composition & Dependency Injection

- One composition root per app (`apps/api/src/container.ts` or equivalent).
  Handlers receive dependencies as constructor/factory args — never construct
  adapters inline, never import an adapter directly in a handler.
- Do not introduce a DI framework without an operator gate; explicit factory
  wiring at the composition root is the default.

### Money

- All monetary amounts are **integer minor units** (cents) with an explicit
  `currency` field — never floats, never bare numbers.
- Revenue-share and markup arithmetic lives in `packages/domain` as pure,
  exhaustively-tested functions. Handlers call them; they never inline money math.
- Every money-path failure branch asserts state conservation (no orphan ledger
  rows) — enforced by L3 tests (quality bar, "Money-Safe").

### Async & I/O

- All I/O is async; independent calls run with `Promise.all`, not sequential awaits.
- Retries/timeouts on outbound I/O live in the adapter, not the handler.

### Derived Data & Caching (INV-025/026, ADR-0002)

- Non-user-specific LLM/aggregator output is materialized in Postgres derived
  tables (`packages/db`) with **semantic cache keys** (window, content hash, or
  scope — never a blind global TTL) plus `computedAt` and producing `model`.
- Read paths are cache-first: derived table → on miss/stale, compute through
  the port → write back. No Redis/in-process memoization for cross-request data.
- Batch/scheduled computation optimizes for cost and output quality, not
  latency — richer prompts and curation passes are encouraged there.
- **Never cache a live price beyond its quote hold/expiry** — money freshness
  is correctness (INV-006), not a tunable.

### Logging & Errors

- Structured JSON logging via the `packages/shared` logger; `console.log` is not
  a logger outside scripts.
- Domain errors are typed (discriminated unions or error subclasses in the
  package that owns the concept); one API-layer error middleware maps them to
  HTTP responses. No scattered try/catch response-shaping in handlers.
- Every log line on a request path carries the request id and, where relevant,
  `agencyId` / `itineraryId`.

### Configuration

- Secrets in `.env` (never committed); non-secret config in typed config modules.
  No hardcoded endpoints, credentials, or magic numbers in `src/`.

### Style & Imports

- ESLint + Prettier as wired by the repo; no per-file style innovation.
- Import from a package's public surface (its `index.ts` export) — never deep
  paths into another package's internals. Internal layout may change freely;
  the public surface is the contract.
- Imports ordered: node builtins → third-party → workspace packages → relative.

### Testing

- Vitest for L1/L2; Playwright for L4. Match existing patterns — do not mix
  frameworks.
- Unit tests mock at the **port boundary**, never at an adapter's internals.
- Every handler and every domain function has at least a happy-path test and the
  primary error-branch test. Money functions get exhaustive branch coverage.
- New integration points require an L3 test (real app + DB, state deltas).
- Product-behavior changes additionally pass **Live Test & Fix** (INV-027,
  ADR-0003): verified against the built compose image with a QA browser
  journey + compose-log scan, evidence archived, defects fixed in-cycle.

---

## Refactoring & Generalization Principles

The goal: after many autonomous SDD cycles, the codebase reads as if one person
designed it. Generalize by *naming concepts*, not by speculative abstraction.

### Pre-Write Discipline (mandatory before any new code)

1. **Reuse scan**: search `packages/` for an existing implementation of the
   capability (grep + read the relevant package's `index.ts`).
2. **Record the decision** in the PR body as one of:
   - `reuse` — an existing export covers it; use it.
   - `extend` — an existing module almost covers it; extend it **in place**
     (same package), don't fork a copy.
   - `generalize` — 2+ callsites now share a shape; hoist the shared concept
     into the owning package with a name, then use it from both.
   - `new` — genuinely novel; justify in one sentence why nothing existing fits.
3. A PR that adds a near-duplicate of an existing function/component without a
   recorded decision is review-blocking (CODE-AHEAD of the architecture).

### Extraction thresholds

- **Value object / named type** — introduce when 2+ co-varying primitives travel
  together (`{ amountMinor, currency }`, `{ listingId, licenseTerms }`). Gate on
  whether naming the concept makes callsites read better, not on callsite count.
- **Shared helper** — hoist to the owning package when the shape encodes a
  domain rule (markup calculation, provenance stamping) and 2+ modules could
  reasonably want it. String-formatting niceties stay local.
- **Port** — introduce when a capability is used by 2+ handlers through the same
  adapter shape, or when testing a single handler forces you to mock half an SDK.
- **New package** — only when a capability is reusable across apps AND has a
  stable public surface. A package with one consumer is usually just a folder.

### Deletion discipline

- Dead code is removed, not commented out. Removal PRs cite the quality-sweep
  finding or the grep proving zero references.
- When replacing an implementation, delete the old one in the same PR — no
  "v2" files sitting beside "v1" (`utils2.ts`, `newHandler.ts` are review-blocking).

---

## Anti-Patterns (review-blocking unless justified in the PR body)

- Declaring an itinerary-shaped type outside `packages/itinerary-schema`.
- Importing a supplier SDK or mentioning its API shapes outside `packages/supply-adapter`.
- Money as floats, or money math inline in a handler.
- Handler importing a concrete adapter instead of its port.
- Deep imports into another package's internals.
- Near-duplicate function/component of an existing export (missing Pre-Write decision).
- `any` as an escape hatch on a public surface; untyped `catch (e)` rethrown blind.
- Files named `utils.ts`/`helpers.ts` accumulating unrelated exports — helpers
  live with the concept they serve or in a named `shared` module.
- Commented-out code, `TODO`/`FIXME` in shipped code (file a ticket instead).
- A new file that no other file imports (orphan) merged without a wiring step.
- Test that mocks the module under test's own internals to force green.

---

## Default Response Sequence

When implementing "add X" or "fix Y":

1. Identify the layer (app route / application / domain / adapter / schema).
2. Run the Pre-Write Discipline scan; record reuse/extend/generalize/new.
3. Find the closest existing example and mirror its structure.
4. List every file that must change; implement in one pass, all callsites.
5. Tests per the hard rules; run lint + quick tests before committing.
