# Implementation Plan: Regression Oracle — L3 State-Delta Harness + PMF Instrumentation Events

**Branch**: `kitchen/fix-seed-0004-l3-harness-pmf-events` (spec dir `004-l3-harness-pmf-events`) | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-l3-harness-pmf-events/spec.md`

## Summary

Upgrade the L3 regression oracle from response-checking to state-delta
verification (real action → exact Postgres row deltas, plus zero-delta
conservation on failure paths), ship the L4 evidence tooling (log-scan +
per-ticket evidence capture) mandated by INV-027, and land the PMF metric
event plumbing mandated from v1 (INV-021; Constitution MVP Scope Discipline):
a tenant-scoped `pmf_event` table, a transactional typed recorder in
`packages/db`, and four SQL metric views applied at migrate time (GBV,
take-rate per active agent, resold:self-built, plan→book). Everything is
dependency-free at the harness layer and lockfile-neutral overall.

## Technical Context

**Language/Version**: TypeScript 5.6 (packages), plain Node ≥20 ESM scripts (harness)

**Primary Dependencies**: existing only — drizzle-orm 0.36 / pg 8 (packages/db), vitest 2.1, @playwright/test 1.49 (unchanged config). **Hard constraint: zero new dependencies / zero lockfile changes** (loop runtime cannot run `pnpm install`).

**Storage**: PostgreSQL 17 (compose service; the single system of record, INV-003). New: `pmf_event` table + 4 metric views.

**Testing**: Vitest L1/L2 (CI, no DB) for emitter validation + log-scan logic; the sealed L3 oracle `node tests/integration/smoke.mjs` against the booted compose stack for state-delta, conservation, and view verification; INV-027 live pass for the whole PR.

**Target Platform**: local docker-compose stack (Linux containers) + CI ubuntu runner (unit layer only)

**Project Type**: monorepo — test harness (`tests/`) + one package touched (`packages/db`) + one container touched (migrate one-shot)

**Performance Goals**: oracle completes < 60 s against a healthy stack (SC-001); log-scan handles multi-MB compose logs in seconds

**Constraints**: sealed regulator untouched (`kitchenloop.yaml`, quality bar, UAT protocol, pr-manager prompts); oracle entry-point *command* unchanged (`node tests/integration/smoke.mjs`); no canonical itinerary schema change; no supplier shapes anywhere

**Scale/Scope**: ~6 new harness/script files, 1 schema table + 1 SQL view file, ~4 new test files; no UI change

## Constitution Check

*GATE: passed pre-research 2026-07-07; re-checked post-design (Phase 1) — PASS.*

| Principle | Verdict | Evidence |
|---|---|---|
| I. Marketplace-First | PASS | Enables instrumented marketplace/booking seeds (0005/0006); the PMF read models are exactly the liquidity metrics the constitution names. No consumer-surface work. |
| II. Agent Experience Is the Wedge | PASS | No agent-facing surface changed; no time-to-itinerary regression possible (no product flow touched). |
| III. Budget-Aware AI | PASS (N/A) | No AI path touched; no LLM calls added. |
| IV. Canonical Itinerary Schema | PASS | `pmf_event` lives in `packages/db` (operational store), references itineraries by opaque id only; the canonical schema package is untouched — **no schema version bump, no migration note needed**. |
| V. Integrate Supply, Don't Contract It | PASS | No supplier code; harness knows nothing of supply shapes. |
| VI. Trust/Provenance/Revenue-Share Integrity | PASS | This feature builds the conservation-assertion machinery Principle VI requires of money paths; metric views aggregate recorded facts only. |
| MVP Scope Discipline | PASS | "PMF instrumentation is mandatory from v1" — this IS that scope; no P1+ item pulled forward. |
| INV-009 (integer minor units + currency) | PASS | `amount_minor bigint` + `currency char(3)`; validation rejects non-integers; views group by currency, never cross-sum. |
| INV-010 (money math only in domain) | PASS (scoped) | Views do reporting aggregation (SUM/COUNT of recorded facts), not rate/markup/split computation — the *math that decides amounts* stays for `packages/domain` consumers; recorded here are already-decided amounts. |
| INV-021 (same-transaction emission) | PASS | Recorder takes the caller's transaction executor; L1 test proves rollback removes the event. |
| INV-004 (tenant key) | PASS | `agency_id` NOT NULL referencing `organization.id`. |
| Sealed regulator | PASS | No edit to kitchenloop.yaml/quality-bar/UAT/pr-manager; the oracle command string is unchanged — its *implementation* (a repo test file) is product-repo territory, as established by seed-0001/D-004. |

## Project Structure

### Documentation (this feature)

```text
specs/004-l3-harness-pmf-events/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── harness-and-events.md   # script CLIs + recorder/view contracts
├── checklists/requirements.md  # spec quality checklist (done)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
tests/
├── integration/
│   ├── smoke.mjs            # EXTENDED — same entry point; now runs state-delta,
│   │                        #   conservation, and PMF-view live checks
│   └── harness.mjs          # NEW — dep-free L3 primitives: psql exec, snapshot,
│                            #   diff, assertDelta, assertConserved
└── live/
    ├── log-scan.mjs         # NEW — CLI: scan a log (file/stdin) vs pattern minus allowlist
    ├── log-allowlist.json   # NEW — starts empty; entries carry {line, justification}
    ├── collect-evidence.mjs # NEW — CLI: capture compose log + playwright artifacts
    │                        #   into .kitchenloop/evidence/<iter>/<ticket>/, then scan
    └── __tests__/
        └── log-scan.test.ts # NEW — L1 unit tests for scan logic (CI, no docker)

packages/db/
├── src/
│   ├── schema.ts            # EXTENDED — + pmfEvent table (tenant-scoped)
│   ├── pmf-events.ts        # NEW — event types, hand-rolled validation,
│   │                        #   recordPmfEvent(executor, event), typed error
│   ├── index.ts             # EXTENDED — export the new public surface
│   └── __tests__/
│       └── pmf-events.test.ts  # NEW — L1: validation matrix + row mapping +
│                               #   stub-executor insert capture
├── sql/
│   └── pmf-views.sql        # NEW — idempotent DROP+CREATE of the 4 metric views
└── scripts/
    └── apply-views.mjs      # NEW — applies pmf-views.sql via the package's own
                             #   pg dep (runs in the migrate one-shot)

apps/web/Dockerfile          # EXTENDED — migrate stage CMD also applies views
vitest.config.ts             # EXTENDED — include tests/live/**/__tests__ unit tests
```

**Structure Decision**: harness stays in `tests/` (established by seed-0001's
`tests/integration/smoke.mjs` + `tests/e2e/`); PMF plumbing lives in
`packages/db` (it is DB-shaped: a table, a transactional insert, views) per the
layer map in `typescript-clean-architecture` — `domain` holds money *math*,
`db` holds storage + tenant-scoped helpers. No new package: the capability has
one consumer surface and no cross-app reuse yet ("a package with one consumer
is usually just a folder").

## Complexity Tracking

No constitution violations to justify. Two conscious trade-offs recorded:

| Decision | Why | Simpler alternative rejected because |
|---|---|---|
| Views via SQL file + apply script (not drizzle-kit push) | drizzle-kit 0.28 view push support is uncertain; migrate one-shot must be deterministic | Betting the boot path on an unverified toolchain feature risks a broken `--wait` for every consumer |
| Hand-rolled validation in `packages/db` (no zod there) | zod would require adding it to `packages/db/package.json` → pnpm lockfile regen, impossible in the loop runtime (ENV-PNPM-DENY) | Three closed event types; the validation matrix is small and exhaustively unit-tested |
