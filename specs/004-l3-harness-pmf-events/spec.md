# Feature Specification: Regression Oracle — L3 State-Delta Harness + PMF Instrumentation Events

**Feature Branch**: `004-l3-harness-pmf-events`

**Created**: 2026-07-07

**Status**: Draft

**Input**: Ticket seed-0004 — "Regression oracle: L3 state-delta harness + PMF instrumentation events". Build the 4-layer verification harness (compile → execute → parse → state deltas) plus the PMF metric event plumbing mandated from v1 (Constitution, MVP Scope Discipline; PRD §12; INV-021).

## User Scenarios & Testing *(mandatory)*

The "users" of this feature are the people and automated phases that must trust
the product: the loop's regression gate (Regress), the per-ticket live gate
(Execute, INV-027), the merge reviewers (Polish), and the builders of the
upcoming money paths (booking seed-0005, marketplace seed-0006) who must
inherit a harness that makes state-conservation and PMF instrumentation
mechanical rather than aspirational.

### User Story 1 - Regression gate proves real state changes, not just responses (Priority: P1)

The regression oracle currently proves the server boots, routes resolve, and
the database answers a ping. It cannot see whether an action actually changed
the database correctly — a build where sign-up returns 200 but writes nothing
would pass today. The oracle must perform a real user action against the real
running stack and assert the exact rows it creates, and must prove that a
rejected action changes nothing (conservation).

**Why this priority**: This is the "unbeatable test" gap named by the quality
bar — L1/L2 green with a broken service is the exact failure mode the
regression oracle exists to catch. Every later money-path test builds on these
helpers.

**Independent Test**: Boot the built stack, run the existing single oracle
command, and observe: a fresh sign-up is asserted to add exactly one user, one
credential record, and one session; a duplicate sign-up is asserted to be
rejected AND to leave every watched table's row count unchanged. Delivers value
alone — the gate gets strictly stronger with no other story landed.

**Acceptance Scenarios**:

1. **Given** the built stack is running with a reachable database, **When** the
   oracle command runs, **Then** it performs a real sign-up over HTTP and
   asserts the exact state delta (user +1, credential account +1, session +1)
   and exits successfully within its bounded time.
2. **Given** the same running stack, **When** the oracle re-submits the same
   sign-up (duplicate), **Then** it asserts the request is rejected with a
   client error AND that watched tables show zero row-count change
   (conservation), and the oracle stays green.
3. **Given** the application is not reachable or the database is not
   reachable, **When** the oracle runs, **Then** it fails loudly with a legible
   verdict (no silent skip of the state-delta checks).

---

### User Story 2 - PMF metrics are recordable and mechanically measurable from day one (Priority: P2)

The constitution mandates PMF instrumentation from v1: GBV (North Star),
marketplace take-rate revenue per active agent, resold-to-self-built trip
ratio, and plan→book conversion. No feature exists yet that performs those
business actions — but the seeds that do (booking, marketplace) must find the
event vocabulary, the transactional recorder, and the metric read models
already in place, so their money paths emit events in the same transaction as
the business action they measure (INV-021) instead of bolting instrumentation
on later.

**Why this priority**: P2 only because no product action emits yet; it is
still mandatory scope for this ticket ("from day one") and blocks seed-0005/
seed-0006 from landing instrumented.

**Independent Test**: With the stack's schema applied, fixture events inserted
inside a transaction produce exactly the expected metric numbers from the four
metric read models, and the transaction is rolled back leaving no residue.
Emitter validation rejects malformed events (non-integer amounts, missing
currency, unknown types) in unit tests.

**Acceptance Scenarios**:

1. **Given** the migrated database, **When** the oracle inspects the schema,
   **Then** the event store and all four metric read models exist.
2. **Given** a transaction containing known fixture events for two agencies in
   two currencies, **When** the four metric read models are queried inside that
   transaction, **Then** each returns exactly the arithmetically expected
   values (GBV totals per currency, take-rate revenue per active agent per
   currency, resold:self-built counts, plan→book counts), **And** rolling back
   leaves zero fixture rows behind (asserted).
3. **Given** an event with a fractional monetary amount, a missing currency, a
   missing tenant, or an unknown event type, **When** it is validated for
   recording, **Then** it is rejected with a typed error before any write.
4. **Given** a business action recording an event in its own database
   transaction, **When** that transaction rolls back, **Then** the event is
   gone with it (same-transaction guarantee, INV-021) — proven by test.

---

### User Story 3 - Live-evidence tooling is mechanical for every ticket (Priority: P3)

Execute and Regress must produce INV-027 evidence (compose log capture,
log-scan verdict, browser artifacts) for every product-behavior ticket. Today
the log scan and evidence archiving are hand-rolled per iteration. A defect
that only shows in server logs (an unhandled rejection behind a 200) must fail
the stage mechanically, and the evidence trail must land in the standard
directory without per-ticket improvisation.

**Why this priority**: P3 because manual capture exists as a workaround; the
value is consistency and the impossibility of "forgot to scan the log".

**Independent Test**: Run the log-scan helper against a captured log containing
a known ERROR line → non-zero exit listing the offending line; against a clean
log → zero exit. Run the evidence helper for a ticket → compose log captured
into the standard per-iteration/per-ticket directory and scanned in the same
invocation.

**Acceptance Scenarios**:

1. **Given** a log file containing `ERROR`, `FATAL`, or `Unhandled` lines not
   on the allowlist, **When** the log-scan helper runs, **Then** it exits
   non-zero and prints every offending line.
2. **Given** a log whose only matches are allowlisted entries, **When** the
   helper runs, **Then** it exits zero and reports the allowlisted matches as
   skipped (visible, not silent).
3. **Given** a running stack and an iteration/ticket identifier, **When** the
   evidence helper runs, **Then** the compose log is captured under the
   standard evidence path for that iteration/ticket, browser artifacts already
   produced in the standard output locations are gathered alongside it, and
   the log scan verdict is returned as the helper's exit code.
4. **Given** the allowlist file, **Then** it starts empty and its format
   forces each future addition to carry a justification (reviewable in PR).

---

### Edge Cases

- Oracle re-run against the same still-running stack (no volume reset):
  sign-up must use a run-unique identity so the delta assertions stay exact.
- Duplicate-rejection check must not weaken if the platform later adds email
  verification: the assertion is "client-error + zero delta", not a specific
  error code string.
- Metric read models with zero events must return empty/zero results without
  erroring (fresh database is queried by the oracle before fixtures).
- Multi-currency events must never be summed across currencies — every money
  metric is grouped by currency (INV-009).
- An agency counts as "active" per read model based on its participation in
  that metric family (defined per read model), not globally.
- Log-scan applies the live gate's pattern (`ERROR|FATAL|Unhandled`) exactly
  as the gate defines it; the helper must not silently broaden or narrow it.
- Evidence helper when the docker daemon is down: fail loudly (a missing
  compose log is a failed stage, not an empty file).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The regression oracle MUST, in a single bounded-time command
  (the existing sealed oracle entry point), against the real running stack:
  perform a real sign-up over HTTP and assert the exact database state delta
  it causes (user +1, credential account +1, session +1).
- **FR-002**: The oracle MUST assert conservation on a failure path: a
  duplicate sign-up is rejected with a client error and every watched table
  shows zero row-count change.
- **FR-003**: The harness MUST expose reusable state-delta primitives —
  snapshot watched tables, compute deltas, assert an exact expected delta,
  assert zero delta (conservation) — usable by future L3 tests (booking,
  marketplace money paths) without modification.
- **FR-004**: The harness MUST reach the database without adding any new
  package dependency and MUST fail loudly (never skip silently) when the
  stack or database is unreachable.
- **FR-005**: The platform MUST provide a tenant-scoped event store for PMF
  metric events where every event carries the owning agency, the event type,
  event-specific dimensions, and — for monetary events — an integer
  minor-unit amount with an explicit currency.
- **FR-006**: The platform MUST provide a transactional recorder such that an
  event is written in the same database transaction as the business action it
  measures: if the action's transaction rolls back, the event MUST NOT
  survive.
- **FR-007**: The recorder MUST validate events before writing: unknown event
  type, non-integer or negative monetary amount, malformed or missing
  currency, or missing tenant MUST be rejected with a typed error.
- **FR-008**: The event vocabulary MUST cover the four constitution-mandated
  metrics with exactly three event types: trip creation (with a
  self-built vs licensed source), booking confirmation (with GBV amount +
  currency), and take-rate revenue accrual (with amount + currency).
- **FR-009**: The platform MUST expose four metric read models — GBV per
  currency, take-rate revenue per active agent per currency, resold:
  self-built trip ratio, and plan→book conversion — computed from the event
  store, present in every migrated environment, and queryable by later
  features without re-deriving the arithmetic.
- **FR-010**: The oracle MUST live-verify the metric read models: insert
  fixture events inside a transaction, assert each read model returns exactly
  the expected numbers, roll back, and assert no residue.
- **FR-011**: A log-scan helper MUST fail (non-zero exit, offending lines
  printed) on any line matching the live gate's error pattern
  (`ERROR|FATAL|Unhandled`) that is not covered by the allowlist; the
  allowlist MUST start empty and require a per-entry justification field.
- **FR-012**: An evidence helper MUST capture the compose log into the
  standard evidence location for a given iteration/ticket, gather browser
  artifacts already produced in the standard output locations, and return the
  log-scan verdict as its exit status.
- **FR-013**: All new harness entry points MUST be dependency-free plain
  node scripts (no lockfile change anywhere in the repo).
- **FR-014**: Emitter validation logic and log-scan logic MUST be covered by
  unit tests runnable in CI (no database, no docker required for those
  tests).

### Key Entities

- **PMF event**: One business fact relevant to a PMF metric. Attributes:
  type (closed vocabulary), owning agency (tenant), optional acting user,
  optional itinerary reference, optional source dimension
  (self-built|licensed), optional monetary amount (integer minor units) +
  currency, occurrence timestamp. Append-only; never updated.
- **Metric read model**: A derived, queryable presentation of the event store
  for one constitution metric (GBV; take-rate per active agent; resold:
  self-built ratio; plan→book conversion). Always derivable from events alone.
- **Watched-table snapshot**: A point-in-time row-count (or keyed count) view
  of a declared set of tables, used to compute exact deltas around an action.
- **Log allowlist**: A reviewable list (starting empty) of exact documented-
  benign log lines, each with a justification.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The single oracle command completes green in under 60 seconds
  against a healthy built stack, and its checks include at least one exact
  state-delta assertion and at least one zero-delta (conservation) assertion.
- **SC-002**: A build in which sign-up returns success without persisting the
  user is caught red by the oracle (the delta assertion fails) — the class of
  defect invisible to the previous oracle.
- **SC-003**: With fixture events covering two agencies and two currencies,
  all four metric read models return exactly the hand-computed expected
  values, and the fixture transaction leaves zero rows behind.
- **SC-004**: An event recorded inside a rolled-back transaction is absent
  from the event store afterwards (INV-021 same-transaction guarantee holds).
- **SC-005**: A log containing one non-allowlisted `ERROR` line fails the
  log-scan helper with that line printed; the same log with the line
  allowlisted (with justification) passes and reports the skip visibly.
- **SC-006**: Running the evidence helper for a ticket produces the compose
  log in the standard per-iteration/per-ticket evidence directory in one
  command, with the scan verdict as exit code.
- **SC-007**: `pnpm test` (CI, no database) passes with new unit coverage for
  event validation and log-scan logic; no lockfile or dependency change exists
  anywhere in the diff.
- **SC-008**: Future money-path features can express "assert booking writes
  reservation + ledger rows; assert failed booking conserves state" using only
  the shipped harness primitives (no new snapshot/delta machinery needed) —
  demonstrated by the sign-up checks consuming the same primitives.

## Assumptions

- The sealed oracle entry point (`node tests/integration/smoke.mjs` per
  `verification.oracle.smoke_command`) is extended in place — the command
  itself does not change, so no sealed-regulator edit occurs.
- The oracle runs in contexts where the compose stack is booted (Execute live
  gate, Regress REG-L3-STACK); reaching Postgres through the compose-managed
  container is acceptable and keeps the harness dependency-free.
- Sign-up (email + password) is the only real business action available on
  main today; it is used as the harness's proving action. PMF product emission
  points intentionally do NOT exist yet — booking (seed-0005) and marketplace
  (seed-0006) wire them; their ticket bodies already reference the emitted
  events.
- "Active agent" for the take-rate metric is defined, for v0, as an agency
  with at least one take-rate accrual event in the queried currency; refining
  activity windows is a product decision deferred to the first consumer.
- Metric read models live in the database as views applied at migrate time
  (idempotent drop-and-create), so every environment that has run migration
  has the metrics — no application code path is required for them to exist.
- The four PMF metrics are platform-level aggregates; per-agency drill-down
  beyond what the read models expose is future work.
- Evidence directory convention `.kitchenloop/evidence/<iteration>/<ticket>/`
  is established (git-ignored) and consumed by the Execute/Regress phases.
- No new npm dependency can be added in the loop runtime (lockfile cannot be
  regenerated there) — all harness scripts are dependency-free plain node;
  in-package validation is hand-rolled TypeScript.
