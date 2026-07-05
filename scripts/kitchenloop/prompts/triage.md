# Kitchen Loop - Phase 2: Triage (Autonomous)

You are running **autonomously** as part of the Kitchen Loop. No interactive operator is available — never use `AskUserQuestion`; any ask goes to `OPERATOR-DESK.md` as a row. You make all in-scope decisions yourself; anything on DIRECTIVE.md's ALWAYS-HALT list becomes an `OPERATOR-DESK.md` row instead of an action.

## Control Plane — READ FIRST (before any other action)

1. **HALT sentinel.** Check whether `{{REPO_ROOT}}/.kitchenloop/HALT` exists. If it does, print its contents, output the halted sentinel below, and STOP immediately — do no other work this phase:
   ```
   [triage] HALTED -- .kitchenloop/HALT present, iteration {{ITERATION_NUM}}
   ```
2. **Read `DIRECTIVE.md`** (the human setpoint) before doing anything else. It lists what ALWAYS halts: constitution amendments; canonical itinerary schema version bumps/migrations; changes to revenue-share or client-ownership semantics; changes to the loop's own gates (quality bar, regression oracle, UAT protocol, sweep rules, DIRECTIVE itself); `git push` to a remote outside the gated pr-manager merge pipeline; deploys. For ANY work item that matches the ALWAYS-HALT list: do NOT do it — append a row to `OPERATOR-DESK.md` in the documented format (one table row `| ID | Say | Question | Recommendation | Since | Blocks |` plus a one-paragraph context block beneath the table), then SKIP that item and continue.
3. **No interactive operator.** The operator is asynchronous; the ONLY channel to them is an `OPERATOR-DESK.md` row. A gate that is not on the desk was not asked.

## Autonomous Mode Rules

1. **Do NOT use `EnterPlanMode` or `ExitPlanMode`**. Plan inline and proceed.
2. **Do NOT use `AskUserQuestion`**. Make reasonable decisions and document them.
3. Create all tickets without asking for confirmation. Use your best judgment for priority and labeling.
4. **Do NOT use the Write tool to output status messages.** Only use Write/Edit for actual code and documentation files.

## Ticketing Provider Dispatch

Read `ticketing.provider` from `kitchenloop.yaml` first:
- `provider: "none"` (this repo): ALL ticket operations read/write `.kitchenloop/backlog.json`
  (states `todo` / `backlog` / `in_progress` / `in_review` / `done`; fields `id`, `title`, `body`,
  `type`, `priority`, `state`, `created`, `pr_url`). New tickets get local `seed-`/id-style ids —
  there is no `#N` issue form. Do NOT run `gh issue`/`gh pr` for ticket operations.
- `provider: "github"`: use `gh issue`/`gh pr` with the labels under `ticketing.github`. The `gh`
  and `#N` steps below are the github path ONLY.

## Loop Context
- **Repo root**: {{REPO_ROOT}}
- **Iteration worktree**: {{ITER_WORKTREE}}
- **Iteration number**: {{ITERATION_NUM}}
- **Mode**: {{MODE}}
- **Base branch**: {{BASE_BRANCH}}
- **Important**: You are running inside a git worktree, NOT the main repo directory.
  All file writes go to this worktree. Do NOT `cd` to the repo root.

## Your Task

Run the **triage** phase.

**CRITICAL -- Output a sentinel line as your absolute first action** (before reading files or running any commands):

```
[triage] STARTED -- iteration {{ITERATION_NUM}}, mode={{MODE}}
```

### Step 1: Find the Latest Report

Look in docs/internal/reports/ for the most recent iteration report file.

### Step 2: Extract Findings

For each bug, missing feature, improvement, or friction point in the report:
1. Write a clear title (under 80 characters)
2. Write a description with reproduction steps or context
3. Identify the **root cause hypothesis** — which component or file is responsible, and why
4. Include **file pointers** — specific files and line ranges from the experience report or codebase
5. Define **acceptance criteria** — exact conditions for considering the fix verified
6. Write **reproduction steps** — concrete commands or sequence to reproduce the issue
7. Assign a type: `bug`, `feature`, `improvement`, or `exploration`
8. Assign a priority: `critical`, `high`, `medium`, or `low`

**HARD ROADMAP SCOPE — do NOT create out-of-phase tickets.** The PRD roadmap (comment block under
`spec:` in `kitchenloop.yaml`) restricts the loop to the **P0 agent-side MVP**. A finding that
targets a **P2+** item (consumer surface / self-serve planner / self-drive-or-agent fork /
whats-hot feed), a **P3+** item (flights-as-merchant-of-record, direct-supplier-contracting,
multi-region catalogue, consortium/host-agency tooling), or a **PRD non-goal** (ride-hailing/driver
fleet, Airbnb-sourced inventory, generic consumer trip-planner, scraped/AI-fabricated imagery) is
**rejected at triage** — do NOT create a ticket. Record it once in an `out-of-phase` note in the
summary so its existence is logged; it only becomes actionable after an operator unlocks that phase.
In-phase P0 findings proceed to Step 3.

### Step 3: Deduplicate (with abandoned-PR override)

Before creating tickets, check existing tickets to avoid duplicates:
- Search for similar titles and descriptions in the existing backlog
- If a duplicate exists, add a comment to the existing ticket instead of creating a new one

**CRITICAL — Abandoned fix PR override**: When you find a duplicate ticket, check if its fix was
**closed/abandoned without merging** — if so the bug is still live and dedup must be overridden.

- **`provider: "github"`:** check the linked PR:
  ```bash
  gh pr view <pr_number> --json state,mergedAt --jq '{state, mergedAt}'
  ```
  Abandoned when `state == "CLOSED"` and `mergedAt == null`.
- **`provider: "none"` (this repo):** there is no `#N` linkage. The fix branch follows
  `kitchen/fix-<ticket_id>-<desc>`; the fix is abandoned when that branch is NOT merged into
  `origin/{{BASE_BRANCH}}` and has no open PR (cross-check the ticket's `pr_url` field in
  `.kitchenloop/backlog.json`):
  ```bash
  git fetch origin --prune
  git branch -r --merged origin/{{BASE_BRANCH}} | grep "kitchen/fix-<ticket_id>-" || echo "NOT MERGED — abandoned"
  ```

If abandoned, **override the dedup decision**:
- Create a new ticket OR reopen the existing one (set state back to `todo` under `none`)
- Reference the closed fix in the description: "Previous fix (`kitchen/fix-<ticket_id>-…` / PR #N) was closed without merging"
- Set priority to at least the original ticket's priority
- This prevents bugs from going unfixed when fixes are silently abandoned

### Step 4: Create Tickets

Create each ticket using the active ticketing provider (append to `.kitchenloop/backlog.json` when
`provider` is `none`; `gh issue create` when `github`). Include:
- Clear, descriptive title
- Reproduction steps or context in the body
- Appropriate labels/fields (type + priority)
- Reference to the iteration report
- Set `blocks`/`blockedBy` dependencies between related tickets (a dependent ticket must name the
  prerequisite ticket id so backlog grooming and execute can defer it until the prerequisite merges)

### Step 5: Summary

Output all tickets created (or existing ones updated) — use `#N` ids under github, `seed-NNNN`/local
ids under provider `none`:
```
Created: seed-0006 — "Fix login timeout error" (bug, high)
Updated: seed-0002 — "Add retry logic for API calls" (added iteration {{ITERATION_NUM}} findings)
Out-of-phase (not ticketed): [finding + roadmap phase, or "none"]
```

## Rules

- **Do NOT update docs/internal/loop-state.md** — the regress phase handles all loop-state commits
- Use consistent labeling: bug, feature, improvement, exploration
- Priority: Critical = today, High = this week, Medium = this sprint, Low = backlog
