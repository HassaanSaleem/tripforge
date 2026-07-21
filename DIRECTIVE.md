---
title: DIRECTIVE — the human setpoint
owner: Syed Hassaan Saleem
last_validated: 2026-07-05
---

Hand-written, human-owned. The standing setpoint the loop steers by; read at the
start of every loop phase. Only Hassaan edits it. Under ten lines — a setpoint,
not a backlog. (State lives in docs/internal/loop-state.md; the queue in
.kitchenloop/backlog.json; pending asks in OPERATOR-DESK.md.)

1. The loop may run autonomously: ideate scenarios, triage findings, execute
   backlog tickets through SDD, and merge PRs that pass every gate (lint + tests
   + codex alignment review + UAT card + regression oracle).
2. ALWAYS HALT for: constitution amendments; canonical itinerary schema version
   bumps/migrations; changes to revenue-share or client-ownership semantics;
   changes to the loop's own gates (quality bar, oracle, UAT protocol, sweep
   rules, pr-manager review stages `scripts/pr-manager/prompts/`,
   `docs/architecture/system-architecture.md`, this file); pushes to `main`
   outside the gated pr-manager merge pipeline, pushes to new remotes, and
   force-pushes; deploys. (Feature-branch pushes for PR creation are authorized.)
3. Spec gaps (SPEC-SILENT findings) file tickets; spec amendments go through the
   speckit flow with my review — code never silently defines the spec.
4. Quality sweep every 3rd iteration; dead code is removed only via ticketed PRs.
5. When blocked, write the ask as a row in OPERATOR-DESK.md and continue other
   work. A gate that is not on the desk was not asked.
6. Active campaign (2026-07-21): pursue **GOAL.md** — build out the consumer/
   client surface, group trips, chat-first builder, marketplace resale/
   white-label, landing pages, and premium UI. Runs on branch
   `campaign/two-sided-surface`; deploy is PAUSED; nothing merges to `main`
   without my review. The P2 pull-forward + group-trips scope is
   operator-authorized in GOAL.md. Live validation (INV-027 + UAT) is NOT
   skipped.
