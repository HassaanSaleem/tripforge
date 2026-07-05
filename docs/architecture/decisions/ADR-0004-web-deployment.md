# ADR-0004: Web Deployment — Vercel + Supabase (Free Tier, P0)

**Status:** Accepted · **Date:** 2026-07-05 · **Deciders:** Syed Hassaan Saleem (operator), Claude (recommendations)

## Context

The architecture had no deployment target (operator observation, 2026-07-05).
P0 needs only the **web** surface live (the Expo mobile app and the P2 consumer
surface are out of scope). Operator constraint: a **free** solution for now.
The stack (ADR-0001) is a Next.js `apps/web` monorepo app on tRPC + Better Auth
+ Drizzle/Postgres, with the Anthropic SDK behind `LLMPort` and Postgres-backed
derived-data caching (ADR-0002).

## Decision

1. **Web host: Vercel** (Hobby / free) serves `apps/web`. Chosen for zero-config
   Next.js deploys and per-PR preview deployments — the fastest path to a live
   agent-facing MVP.
2. **Database: Supabase Postgres** (free tier) is the managed production system
   of record (INV-003 holds — still one Postgres). Supabase over Neon because it
   offers `pg_cron` for the ADR-0002 batched jobs when they land. Better Auth and
   Drizzle connect via Supabase's **pooled** connection string (serverless-safe);
   TripForge uses Supabase only as Postgres, not its auth (we run Better Auth).
3. **Serverless build contract (INV-028):** feature code is written for stateless
   serverless functions — no in-process cross-request state or in-memory caches
   (derived data lives in Postgres per INV-025), LLM tool-loop handlers stream to
   stay within the function timeout, and scheduled derived-data jobs (INV-026)
   run on Supabase `pg_cron` / Vercel Cron, never an in-process daemon.
4. **Local dev and INV-027 live verification keep docker-compose.** Production
   parity is app/schema-level, not image-for-image; Vercel builds Next.js its own
   way. A feature that only works under a long-lived server process is out of
   contract until the topology changes.
5. **Deploying is an operator action.** DIRECTIVE.md ALWAYS-HALTs deploys — the
   loop produces deploy-compatible code and never triggers a deploy itself.
6. **Secrets** (`ANTHROPIC_API_KEY`, `DATABASE_URL`, auth secrets) live in
   Vercel/Supabase project env, never committed; `.env.example` documents the
   names only.

## Consequences

- Fastest route to a free, live web MVP with preview deploys per PR.
- The serverless contract is a real design constraint the autonomous loop must
  respect from day one (INV-028) — caught by review, not discovered in prod.
- Two free-tier limits become explicit **revisit triggers**:
  - **Vercel Hobby is non-commercial.** Fine for prototype/preview; must move to
    Pro (~$20/mo) before commercial traffic. TripForge is a revenue product, so
    this is a scheduled cost, not an if.
  - **No always-on worker; function timeouts.** P0 does not need the batch/cron
    pieces (the "What's Hot" feed is P2), so this is deferred — but if a feature
    needs a long-lived worker or exceeds serverless timeouts, revisit the host.
- **Fallback host on file:** Fly.io runs the same docker image the loop already
  builds for INV-027, supports always-on workers, and is commercial-OK — the
  natural move if the serverless contract or the Hobby license becomes binding.

## Alternatives considered

- **Fly.io + Postgres** — deploys the actual INV-027 docker image (prod == tested
  artifact), hosts always-on workers, commercial-OK on a small free allowance.
  Rejected *for now* only on ops overhead and DX vs. Vercel's Next.js fit; kept
  as the documented fallback.
- **Neon Postgres** — comparable free Postgres, but no `pg_cron` for the batched
  derived-data jobs; Supabase preferred for forward-compatibility.
- **Render / Railway** — Render free Postgres expires at 90 days and free web
  spins down (cold starts); Railway is no longer meaningfully free (trial credit).
- **Self-host on a VPS with docker-compose** — most control, not free (~$5/mo),
  more ops; revisit only if managed free tiers prove limiting.
