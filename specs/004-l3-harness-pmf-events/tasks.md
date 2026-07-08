# Tasks: Regression Oracle — L3 State-Delta Harness + PMF Instrumentation Events

**Input**: Design documents from `specs/004-l3-harness-pmf-events/`
**Prerequisites**: plan.md, research.md (D1–D10), data-model.md, contracts/harness-and-events.md, quickstart.md

**Tests**: included — this feature IS test infrastructure; its unit layer (FR-014) and live oracle checks are the deliverable, not optional add-ons.

**Organization**: grouped by user story (US1 state-delta oracle, US2 PMF events, US3 L4 evidence tooling) so each story is independently completable and testable.

## Phase 1: Setup

- [X] T001 Extend `vitest.config.ts` include to also match `tests/live/**/__tests__/**/*.test.ts` (research D9; FR-014) — no other config change.

## Phase 2: Foundational (blocking prerequisites)

- [X] T002 Create `tests/integration/harness.mjs` — dependency-free L3 primitives per contracts §3: `sql(statements, {timeoutMs})` via `docker compose exec -T postgres psql -U tripforge -d tripforge --csv -v ON_ERROR_STOP=1` (stdin for multi-statement sessions), `snapshotTables`, `diffSnapshots`, `assertDelta`, `assertConserved`, `WATCHED_TABLES = ["user","account","session","organization","member","pmf_event"]`; unreachable docker/DB throws a legible error (FR-003/FR-004, research D1).

## Phase 3: User Story 1 — Regression gate proves real state changes (P1) 🎯 MVP

**Goal**: the sealed oracle command performs a real sign-up, asserts exact row deltas, and proves conservation on the duplicate-rejection path — all bounded < 60 s.

**Independent test**: `docker compose up --build --wait && node tests/integration/smoke.mjs` shows the new `ok` lines (quickstart §2) and stays green without any US2/US3 file existing (the `pmf_event` watched-table entry no-ops via `to_regclass` guard until US2 lands).

- [X] T003 [US1] Rework `tests/integration/smoke.mjs` to import the harness, wrap the whole run in a 60 s global budget with per-call 15 s timeouts (research D10), and keep the four existing checks byte-equivalent in intent (no assertion weakened) (FR-001 bounded-time shell).
- [X] T004 [US1] Add sign-up state-delta check to `tests/integration/smoke.mjs`: snapshot → `POST /api/auth/sign-up/email` with run-unique email `l3-smoke-<epoch>-<pid>@example.test` → assert delta `{user:+1, account:+1, session:+1}` and all other watched tables 0 (FR-001; contracts §6 check 5).
- [X] T005 [US1] Add duplicate-sign-up conservation check to `tests/integration/smoke.mjs`: snapshot → re-POST same email → assert HTTP 4xx AND `assertConserved` across all watched tables (FR-002; contracts §6 check 6; edge case "client-error + zero delta, not a specific error string").

**Checkpoint**: US1 delivers SC-001/SC-002 alone — the oracle is strictly stronger.

## Phase 4: User Story 2 — PMF metrics recordable + mechanically measurable (P2)

**Goal**: `pmf_event` store + transactional recorder + four migrate-time metric views, live-verified by the oracle.

**Independent test**: unit suite green without a DB; after boot, oracle checks 7–8 verify schema presence and exact view arithmetic inside a rolled-back fixture transaction (quickstart §2, §5).

- [X] T006 [P] [US2] Add `pmfEvent` table to `packages/db/src/schema.ts` per data-model.md (uuid PK default `gen_random_uuid()`, `type` text NOT NULL, `agency_id` FK→organization cascade, `actor_user_id` FK→user set-null, nullable `itinerary_id`/`source`/`amount_minor` bigint/`currency`, `created_at` default now, index `(type, agency_id)`); include in the `schema` export map.
- [X] T007 [US2] Create `packages/db/src/pmf-events.ts` per contracts §1: `PmfEvent` union (3 types), `PmfEventValidationError` with typed `reason`, pure `validatePmfEvent()` covering the full data-model validation matrix, `recordPmfEvent(executor, event)` that validates then inserts via the caller's executor and never opens its own transaction (FR-005/006/007/008; research D5/D6).
- [X] T008 [US2] Export `pmfEvent`, `PmfEvent`, `PmfEventValidationError`, `validatePmfEvent`, `recordPmfEvent`, `PmfEventExecutor` from `packages/db/src/index.ts` (public-surface rule — consumers import the package root only).
- [X] T009 [P] [US2] Create `packages/db/sql/pmf-views.sql` — idempotent `DROP VIEW IF EXISTS` + `CREATE VIEW` for `pmf_gbv`, `pmf_take_rate_per_active_agent`, `pmf_resold_vs_self_built`, `pmf_plan_to_book` exactly as specified in data-model.md (FR-009; research D3).
- [X] T010 [P] [US2] Create `packages/db/scripts/apply-views.mjs` (uses the package's existing `pg` dep; reads `DATABASE_URL`; applies `sql/pmf-views.sql`; loud non-zero exit on failure) and add package script `"db:views": "node scripts/apply-views.mjs"` to `packages/db/package.json` (scripts section only — NO dependency change).
- [X] T011 [US2] Extend the `migrate` stage CMD in `apps/web/Dockerfile` to run schema push then views: `CMD ["sh","-c","pnpm --filter @tripforge/db run db:push && pnpm --filter @tripforge/db run db:views"]` (FR-009 "present in every migrated environment").
- [X] T012 [P] [US2] Create `packages/db/src/__tests__/pmf-events.test.ts` — L1 matrix: every `PmfEventValidationError.reason` reachable; valid events of all 3 types map to exact row shapes via a stub executor capturing `insert().values()`; recorder rejects before any executor call on invalid input; recorder makes exactly one insert per event (FR-007/FR-014; SC-004 unit witness per quickstart §5).
- [X] T013 [US2] Add oracle checks 7–8 to `tests/integration/smoke.mjs` per contracts §6: `to_regclass` presence of table + 4 views; single psql session `BEGIN; INSERT 2 fixture orgs + 6 fixture events (2 agencies, 2 currencies, licensed + self_built, booked + unbooked); SELECT each view; ROLLBACK;` asserting exact hand-computed numbers and post-rollback `pmf_event` count unchanged (FR-010; SC-003/SC-004).

**Checkpoint**: US2 delivers SC-003/SC-004/SC-007 (with T001/T012) independent of US3.

## Phase 5: User Story 3 — Mechanical live-evidence tooling (P3)

**Goal**: log-scan + one-command evidence capture with the scan verdict as exit code.

**Independent test**: quickstart §4 — synthetic log files drive exit codes; live run captures `compose.log` into `.kitchenloop/evidence/<iter>/<ticket>/`.

- [X] T014 [P] [US3] Create `tests/live/log-allowlist.json` with `{ "entries": [] }` (FR-011; data-model.md allowlist shape).
- [X] T015 [P] [US3] Create `tests/live/log-scan.mjs` per contracts §4: exported pure `scanLines(lines, entries)`; CLI reads file or stdin, applies `/ERROR|FATAL|Unhandled/` per line, allowlists only entries with non-empty justification, prints `MATCH:` / `SKIP (allowlisted):` lines, exits 0/1/2 (FR-011; research D7).
- [X] T016 [US3] Create `tests/live/__tests__/log-scan.test.ts` — L1 units: clean log passes; each pattern word fails; case variants NOT matched (pattern fidelity); allowlisted line skips visibly; allowlist entry with empty justification does NOT allowlist; multiple matches all reported (FR-014; SC-005).
- [X] T017 [US3] Create `tests/live/collect-evidence.mjs` per contracts §5: `--iteration/--ticket/--dir` args, mkdir -p, `docker compose logs --no-color` → `compose.log` (daemon down → loud exit 2), copy `.kitchenloop/evidence/test-results` + `.kitchenloop/evidence/playwright-report` when present, then run log-scan and propagate its exit code (FR-012/FR-013; SC-006).

## Phase 6: Polish & live verification (INV-027)

- [ ] T018 Run lint + unit suites (host `pnpm` if permitted, else in-image per quickstart §1): `pnpm run lint`, `pnpm test` — all green, new suites visible; verify zero package.json dependency / lockfile changes in the diff (SC-007).
- [ ] T019 Live Test & Fix per INV-027: `docker compose down -v && docker compose up --build --wait`; run `node tests/integration/smoke.mjs` (all checks incl. 5–8 green, < 60 s); run one falsifiability probe from quickstart §3 (witness red, revert); run `node tests/live/collect-evidence.mjs --iteration 3 --ticket seed-0004`; verify evidence dir contents + clean scan; fix-rebuild-retest any defect (max 3 cycles).
- [ ] T020 Teardown (`docker compose down -v`); assemble PR body sections (Ticket, Pre-Write decisions, spec-alignment table FR-001…FR-014 → files → tests, Live Test Evidence with excerpts + evidence path).

## Dependencies & execution order

- T001 → (T016 discovery) — otherwise independent of everything.
- T002 blocks T003–T005 and T013 (harness consumers).
- T006 → T007 → T008; T009 → T010 → T011; T012 needs T007; T013 needs T002+T006+T009+T011 (views exist after migrate).
- US3 (T014–T017) independent of US1/US2 except T017 uses T015.
- T018–T020 last.

Parallel opportunities: {T006, T009, T014, T015} then {T007, T010, T012-after-T007}; US1 (T003–T005) can proceed while US2 files are authored — same file `smoke.mjs` for T003/T004/T005/T013 so those four are sequential within themselves.

## Implementation strategy

MVP = Phase 1–3 (US1): the oracle gets state-delta + conservation immediately.
US2 then lands the PMF plumbing the next seeds require; US3 completes the
INV-027 tooling. All three ship in this PR (ticket scope), but each checkpoint
is independently green.
