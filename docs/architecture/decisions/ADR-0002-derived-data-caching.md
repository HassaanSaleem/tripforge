# ADR-0002: Postgres-Backed Derived-Data Caching

**Status:** Accepted · **Date:** 2026-07-03 · **Deciders:** Syed Hassaan Saleem (operator), Claude (drafting)

## Context

Much of TripForge's AI/aggregator output is not user-specific and not
time-critical: the "What's Hot" feed is per-destination-per-week content,
listing quality scores change only when the listing changes, markup
suggestions vary by category/destination/season, and supplier static content
(descriptions, amenities, imagery refs) barely changes at all. Recomputing
these per request would multiply LLM and aggregator costs by the user count
for identical output.

Operator directive (2026-07-03): cache aggressively and architect smartly —
the optimization target is **cost and sophistication, not speed**. A weekly
batch that spends more tokens on one well-curated computation is preferred
over thousands of cheap per-request calls.

## Decision

1. **Postgres is the cache** (INV-003 single system of record — no Redis or
   in-memory cache tier without a new ADR). Derived results are materialized
   as ordinary tables in `packages/db` with normal migrations and tests.
2. **Semantic cache keys, not blunt TTLs** (INV-025): windowed keys
   (`destination × iso_week`) invalidate by period; content-hash keys
   (`listing_id × content_sha`) invalidate by actual change; seasonal keys by
   scope. Every row carries `computed_at`, producing `model`, and refresh
   policy — staleness is visible and auditable, never silent.
3. **Read path is cache-first**: request → derived table → on miss/stale,
   compute via `LLMPort`/supply port → write back. Scheduled refresh (weekly
   feed, seasonal suggestions) uses Postgres-native scheduling (pg-boss or
   pg_cron) when a feature plan needs it — no new broker.
4. **Cost-over-latency for batch computation** (INV-026): batched jobs may use
   richer prompts, multiple curation passes, and larger contexts, since they
   run once per window. Per-request LLM calls are reserved for user-specific
   drafting.
5. **Hard carve-out:** live prices are never cached beyond their quote
   hold/expiry (INV-006). Cacheable = derived/editorial/static content;
   never-cacheable-beyond-hold = anything a customer pays.

## Consequences

- LLM spend scales with content windows (destinations × weeks), not with
  traffic — the marginal cost of a new user reading the feed is a Postgres
  read.
- Provenance metadata (`computed_at`, `model`) makes derived content
  re-scorable after a model change and debuggable ("which model wrote this
  feed entry?").
- Adds migration/table overhead per derived dataset — accepted; tables are
  cheap, and the quality-sweep/boundary tooling already covers `packages/db`.
- Revisit triggers: read-volume hot spots that Postgres can't serve (add a
  cache tier via new ADR), or cross-region latency needs (P3).

## Alternatives considered

- **Redis cache tier** — rejected at MVP: second datastore (violates INV-003),
  opaque TTL semantics, and latency isn't the target.
- **Per-request LLM calls with prompt caching only** — rejected: prompt
  caching cuts input cost ~90% but still pays output tokens per request for
  identical content.
- **In-process memoization** — rejected: invisible, non-durable, per-instance
  inconsistent.
