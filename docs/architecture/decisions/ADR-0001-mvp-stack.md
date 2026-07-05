# ADR-0001: MVP Technology Stack

**Status:** Accepted · **Date:** 2026-07-03 · **Deciders:** Syed Hassaan Saleem (operator), Claude (recommendations)

## Context

TripForge P0 is a simple web + mobile app: CRUD-dominant, simple LLM calls,
good UI, boots locally via docker-compose, open-source/free tools only for now
(operator constraints, 2026-07-03). The stack must serve both surfaces from one
shared engine (PRD §4) and respect the constitution's adapter boundaries.

## Decision

| Concern | Decision | Alternatives considered |
|---------|----------|------------------------|
| App shape | Next.js (web) + Expo React Native (mobile) in one pnpm/turborepo monorepo with shared packages | Expo universal app (weaker web UI); web-first only (agents are mobile-heavy) |
| API | tRPC with zod I/O, one router consumed by both clients | REST+OpenAPI (more boilerplate now; revisit when partner APIs needed); server actions (mobile would need a second path) |
| Database | PostgreSQL, single system of record; Drizzle ORM (suggested default) | Prisma (heavier runtime); Supabase stack (couples auth+db+storage) |
| Auth | Better Auth on platform Postgres; organization plugin = agency multi-tenancy | Auth.js (weaker org/Expo story); Keycloak (overkill); Supabase self-hosted (heaviest compose) |
| LLM | **Official Anthropic SDK** (`@anthropic-ai/sdk`) behind an in-house `LLMPort`; Claude API in dev + prod; deterministic fakes at the port boundary in tests; every call metered. **All calls on `claude-haiku-4-5` ($1/$5 per MTok) — no Opus.** Tools defined in code (`packages/llm/src/tools/`, zod schemas via `betaZodTool`) wrapping the supply ports. *(Revised 2026-07-03 a: was Vercel AI SDK + Ollama — operator chose the Anthropic SDK for native tool use and dropped Ollama. Revised 2026-07-03 b: operator set Haiku-only for cost — a full itinerary draft costs ~$0.02–0.05; model is config, upgrade path stays one line if UAT flags drafting quality.)* | Vercel AI SDK (thinner tool-use surface); Opus 4.8/Sonnet 4.6 drafting (5–25× cost, deferred unless quality demands); LiteLLM proxy; Ollama local models (quality gap, dropped) |
| UI | Tailwind + shadcn/ui (web), NativeWind (mobile) — suggested defaults | Chakra/MUI (heavier, less composable) |
| Local boot | docker-compose: postgres + mailpit; app services join as they're built; `ANTHROPIC_API_KEY` in `.env` for AI features | — |
| Payments | Deferred — mock `PaymentsPort` until marketplace transactions land; merchant-of-record per component is an open PRD §15 question | — |

## Consequences

- One language (TypeScript) end to end; canonical itinerary schema shared as
  actual code by web, mobile, API, and adapters (reinforces INV-001).
- REST facade is a later additive layer, not a rewrite (tRPC procedures wrap
  cleanly).
- Better Auth's organization model becomes the tenancy primitive (INV-004);
  switching auth later means an auth-table migration, accepted risk at MVP.
- Zero paid services required for the CRUD stack, tests, or CI (INV-019); AI
  features need only `ANTHROPIC_API_KEY`. The Anthropic SDK gives the planner
  native tool use (the SDK tool runner drives supply-port lookups as tool
  calls), structured outputs for schema-conformant itinerary generation, and
  prompt caching for the stable planner system prompt.
- Revisit triggers: partner/external API demand (add REST facade), LLM cost
  visibility at scale (LiteLLM), marketplace payments (payments provider + MoR
  decision — its own ADR).
