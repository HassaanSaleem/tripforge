# KitchenLoop: Execute

> Phase 3 -- Query top unblocked tickets, implement them sequentially, ship PRs.

## Triggers

- `kitchenloop execute`
- `loop execute`
- `work on tickets`

---

## Overview

The Execute phase takes tickets from the todo queue and turns them into merged
code. Each ticket follows a strict workflow: branch, implement, lint, test,
commit, PR, transition state. The goal is steady throughput -- 3 to 5 tickets
per iteration.

---

## Procedure

### Step 0: Pre-Flight

1. Load `kitchenloop.yaml` -- read `paths`, `verification`, `ticketing`, and `repo`.
2. Read loop state at `paths.loop_state` for current iteration context.
3. Check environment variables listed in `verification.preflight_env_vars`.
   If any are missing, STOP and report which are absent.

### Step 1: Check PR Backpressure

Before starting new work, check for open PRs from previous iterations:

```bash
gh pr list --author "@me" --state open --json number,title,mergeable,reviewDecision,statusCheckRollup
```

**Backpressure rules:**
- If there are **5+ open PRs**, STOP. Focus on getting existing PRs merged
  (address review comments, fix failing CI, ping reviewers).
- If there are **3-4 open PRs**, limit this iteration to 2 tickets max.
- If there are **0-2 open PRs**, proceed normally (3-5 tickets).

### Step 2: Recover Stale Tickets

Check for tickets marked as in-progress that have no active branch or PR.
These are artifacts of interrupted previous iterations.

For GitHub Issues ticketing:
```bash
gh issue list --label "{ticketing.github.state_labels.in_progress}" --json number,title
```

For each stale ticket:
- If a branch exists with changes, pick up where it left off.
- If no branch exists, transition back to todo state.

<!-- CUSTOMIZE: Add logic for your ticketing provider if not GitHub Issues.
     For example, Linear API calls or Jira transitions. -->

### Step 3: Select Tickets

1. Query the todo queue, ordered by priority:
   ```bash
   gh issue list --label "{ticketing.github.state_labels.todo}" --json number,title,labels,body --limit 10
   ```
2. Filter out tickets that are blocked (check for "blocked" label or dependencies
   mentioned in the ticket body).
3. Select the top 3-5 unblocked tickets (adjusted by backpressure from Step 1).
4. Prefer a mix of categories (bugs, features, improvements) over all-of-one-type.

### Step 4: Implement Each Ticket

For each selected ticket, execute the following sub-steps sequentially:

#### 4a. Create Branch

```bash
git checkout {repo.base_branch}
git pull origin {repo.base_branch}
git checkout -b {repo.iteration_branch_prefix}-{iteration}-{ticket_id}
```

#### 4b. Transition Ticket to In-Progress

For GitHub Issues:
```bash
gh issue edit {ticket_number} --remove-label "{ticketing.github.state_labels.todo}" --add-label "{ticketing.github.state_labels.in_progress}"
```

#### 4c. Implement the Fix/Feature

1. Read the ticket body carefully for requirements and acceptance criteria.
2. Identify the relevant files -- use search tools, not guesswork.
3. Make the minimal change that satisfies the ticket.
4. Follow the project's coding conventions and patterns.

**TripForge: Spec-Driven Development routing (STD-001).** This repo implements
features through a loop over SDD. Route each ticket by size before coding:

- **Feature-sized ticket** (new capability, new user-visible behavior, anything
  touching the canonical itinerary schema, money paths, or the supply adapter
  boundary): do NOT implement directly. Run the Spec Kit flow first, inside the
  ticket's branch:
  1. `/speckit-specify` — create the feature spec from the ticket body
  2. `/speckit-plan` — design artifacts; MUST pass the Constitution Check
     against `.specify/memory/constitution.md`
  3. `/speckit-tasks` — dependency-ordered tasks
  4. `/speckit-implement` — execute the tasks
  The spec/plan/tasks artifacts ship in the same PR as the implementation.
- **Bug-sized ticket** (broken behavior with a repro, no new surface): fix
  directly with a test that reproduces the bug first.
- **Improvement-sized ticket** (polish, refactor, docs): implement directly
  within the quality bar.

Constitution gates that always apply (see `.kitchenloop/quality-bar.md`,
"The Bar"): canonical itinerary schema changes need a migration note; no
supplier API shapes outside the adapter; money paths need L3 sandbox
integration tests; nothing from the constitution's v2+ deferred list.

**Clean-code policy + Pre-Write Discipline (mandatory for every ticket).**
Follow `.claude/skills/typescript-clean-architecture/SKILL.md`. Before writing
any new code: run the reuse scan (search `packages/` and read the relevant
public surfaces) and record the decision — `reuse` / `extend` / `generalize` /
`new` (with one-line justification) — in the PR body. A near-duplicate of an
existing export without a recorded decision is review-blocking.

**PR body contract.** Every PR must include:
1. The Pre-Write decision(s) as above.
2. For feature-sized tickets: a spec-alignment table — each functional
   requirement from `spec.md` → implementing file(s) → test(s), with any
   deferred requirement explicitly marked and ticketed. This table is what the
   Stage 4a codex alignment review verifies against.
3. A **Live Test Evidence** section (INV-027): the live-verification verdict
   from step 4e — PASS with journey + evidence path + key log excerpts, or an
   explicit `N/A (no product behavior change)` / `SKIPPED (pre-skeleton)`.
   A missing section is review-blocking.

**Implementation guardrails:**
- Do NOT refactor unrelated code in the same commit.
- Do NOT add dependencies unless the ticket specifically requires it.
- Do NOT modify test infrastructure unless the ticket is about test infrastructure.
- Keep each PR focused on exactly one ticket.

#### 4d. Lint and Test

1. Run lint: the command from `verification.oracle.lint_command`
2. Run quick tests: the command from `verification.oracle.quick_command`
3. If `verification.oracle.smoke_command` is configured, run it too — this is the L3
   integration gate that verifies the real app still works.
4. If any check fails, fix the issue before proceeding.
5. If the fix requires more than 3 attempts, skip the ticket and add a comment
   explaining the blocker.

#### 4e. Live Test & Fix (INV-027, ADR-0003 — mandatory for product-behavior changes)

Unit/integration green is necessary, not sufficient. Before committing,
verify the change against the **built artifact**, like a QA would:

1. **Build + boot the real stack**: `docker compose down -v && docker compose up --build --wait`
   (fresh image, real Postgres + mailpit, clean state).
2. **Live smoke**: run `verification.oracle.smoke_command` against the running
   stack; for UI-facing changes also run the relevant Playwright specs
   (`npx playwright test`) — screenshots/traces are captured automatically.
3. **QA journey**: drive the changed flow end-to-end in a real browser
   (Playwright MCP) exactly as a user would — click, type, submit — and
   screenshot each step into the evidence directory.
4. **Log review**: `docker compose logs --no-color > .kitchenloop/evidence/<iteration>/<ticket>/compose.log`,
   then scan it — any ERROR-level line or unhandled exception not on a
   documented allowlist is a failure, even if the UI looked fine.
5. **Fix loop**: any defect found → fix the code → rebuild → re-run steps 2–4.
   Max 3 fix cycles; after that, move the ticket back to todo with a blocker
   comment. NEVER weaken an assertion, allowlist a real error, or skip a step
   to get green.
6. **Archive evidence** under `.kitchenloop/evidence/<iteration>/<ticket>/`
   (git-ignored) and add a **Live Test Evidence** section to the PR body:
   verdict, journey tested, key log excerpts, defects found and fixed.
7. **Teardown**: `docker compose down -v`.

Carve-outs: docs/CI/pure-refactor tickets with zero user-visible change may
record `N/A (no product behavior change)`. Until seed-0001 lands a runnable
web service, record `SKIPPED (pre-skeleton)`. Both go in the PR body —
explicit, never silent. If the Docker daemon is unavailable, this stage FAILS
(report it; do not proceed to PR as if verified).

#### 4f. Commit and Push

```bash
git add {specific_files}
git commit -m "{type}: {description} (#{ticket_id})"
git push -u origin {branch_name}
```

Commit message types: `fix:`, `feat:`, `refactor:`, `test:`, `docs:`, `chore:`

#### 4g. Create PR

```bash
gh pr create \
  --title "{type}: {short description}" \
  --body "$(cat <<'EOF'
## Summary
{1-3 bullet points describing the change}

## Ticket
Closes #{ticket_number}

## Test Plan
- [ ] Lint passes
- [ ] Quick tests pass
- [ ] {specific test for this change}

## Live Test Evidence (INV-027)
{verdict: PASS | N/A (no product behavior change) | SKIPPED (pre-skeleton)}
{journey tested, evidence path, key log excerpts, defects found and fixed}

Generated by KitchenLoop iteration {N}
EOF
)" \
  --base {repo.pr_target}
```

#### 4h. Transition Ticket to In-Review

```bash
gh issue edit {ticket_number} --remove-label "{ticketing.github.state_labels.in_progress}" --add-label "{ticketing.github.state_labels.in_review}"
```

### Step 5: Update Loop State

Update `paths.loop_state` with:
- Tickets attempted and their outcomes (completed, skipped, blocked)
- PRs created (numbers and URLs)
- Any tickets that were stale-recovered

---

## Output Contract

At the end of the Execute phase:

1. **3-5 PRs created** (or fewer if backpressure limited throughput)
2. **Tickets transitioned** to in-review state
3. **Stale tickets recovered** or transitioned back to todo
4. **Loop state updated** at `paths.loop_state`

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Lint fails after 3 fix attempts | Skip ticket, add comment, move back to todo |
| Tests fail on unrelated code | Note in PR body, proceed if ticket-specific tests pass |
| Branch conflict with base | Rebase, resolve conflicts, retry |
| Ticket is ambiguous | Add clarifying comment, implement best interpretation, note in PR |
| CI fails on PR | Check logs, fix if possible, label needs-attention if not |

---

## Configuration Reference

| Config Key | Used For |
|-----------|----------|
| `repo.base_branch` | Base for new branches |
| `repo.pr_target` | PR target branch |
| `repo.iteration_branch_prefix` | Branch naming |
| `ticketing.provider` | Ticketing system |
| `ticketing.github.state_labels` | Issue label transitions |
| `verification.oracle.lint_command` | Lint check |
| `verification.oracle.quick_command` | Quick test |
| `verification.preflight_env_vars` | Required env vars |
| `paths.loop_state` | Loop state file |
