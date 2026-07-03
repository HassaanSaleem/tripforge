# ADR-0003: Live Verification per SDD Cycle

**Status:** Accepted · **Date:** 2026-07-03 · **Deciders:** Syed Hassaan Saleem (operator), Claude (drafting)

## Context

The Kitchen Loop's verification originally topped out at test suites: L1/L2
per PR, L3 via the oracle, L4 deferred to the UAT gate. Operator directive
(2026-07-03): **testing must be live** — after each SDD cycle
(code → review → unit test → integration test), the loop must boot the built
artifact, test it like a QA would, review screenshots and logs, and fix what
it finds in the same cycle. "No point of loop if test is not live": a loop
that never touches the running product is grading its own homework.

## Decision

1. **The test target is the built artifact.** Live verification boots
   `docker compose up --build --wait` — the freshly built image plus real
   Postgres and mailpit — never a dev server. State is reset per run
   (`docker compose down -v`) so results are reproducible.
2. **QA driver is Playwright + Playwright MCP** (both open-source):
   - `@playwright/test` for scripted L4 journeys — screenshot-on-failure,
     per-step traces, video, all out of the box;
   - `@playwright/mcp` for agent-driven QA — the implementer (Live Test &
     Fix stage) and the zero-context `uat-evaluator` drive a real browser
     through the changed flow, screenshotting each step as evidence.
3. **Placement: inside Execute, per ticket** — a mandatory **Live Test & Fix**
   stage after lint/unit/integration tests pass and **before** commit/PR:
   build + boot → live smoke + relevant Playwright specs → QA journey of the
   changed flow → compose-log scan (fail on non-allowlisted ERROR lines) →
   **fix → rebuild → re-test** until green (max 3 fix cycles, then the ticket
   goes back to todo with a blocker comment — assertions are never weakened
   to pass). The UAT gate then re-verifies independently against the same
   live stack.
4. **Evidence is the witness** (proof-carrying claims): per-step screenshots,
   traces, and the captured compose log are archived under
   `.kitchenloop/evidence/<iteration>/<ticket>/` (git-ignored — binaries stay
   local); the PR body carries a Live Test Evidence section with the verdict,
   key log excerpts, and what was fixed. UAT evidence continues to live in
   `.kitchenloop/uat-runs/` and is attached to the PR as a comment.
5. **Pre-skeleton carve-out:** until seed-0001 lands a runnable compose web
   service, the stage records `SKIPPED (pre-skeleton)` in the PR body —
   explicitly, never silently. seed-0001 itself wires the compose `build:`
   target, Playwright, the live-smoke script, and the evidence directory.

Enforced as **INV-027 [M]** in `docs/architecture/system-architecture.md`.

## Consequences

- Every product-behavior PR carries live evidence; "38 unit tests pass but
  the service is broken" cannot survive a cycle.
- Iteration time grows by an image build + browser run per ticket — accepted;
  the loop optimizes for correctness and evidence, not wall-clock (same
  philosophy as INV-026).
- Playwright browsers and the MCP server become dev dependencies installed by
  seed-0001 (`npx playwright install`); CI needs the same.
- Docker must be running for Execute to complete live verification; if the
  daemon is unavailable the stage fails loudly (a desk-visible blocker),
  never silently skips.
- Mobile (Expo) journeys are out of scope for P0 live verification; revisit
  with **Maestro** when apps/mobile ships real flows (P1).

## Alternatives considered

- **Cypress** — rejected: heavier runtime, weaker trace/artifact story than
  Playwright, no MCP path for agent-driven QA.
- **Selenium** — rejected: legacy ergonomics, flaky waits, no built-in
  evidence capture.
- **Testcontainers** — rejected as the primary: API-level only; compose is
  already the local runtime and the thing we actually ship.
- **agent-browser (kitchenloop ui mode)** — kept as an optional ideation mode
  (`kitchenloop.yaml` ui_tests, commented); Playwright MCP covers the same
  ground with a maintained toolchain and native screenshots.
- **Deferring live checks to a nightly job** — rejected: defects would land
  on main between nightly runs; the operator directive is fix-in-cycle.
