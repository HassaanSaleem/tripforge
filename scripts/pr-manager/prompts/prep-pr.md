# PR Preparation Pipeline

You are preparing PR #{{PR_NUMBER}} for merge. Follow this pipeline strictly.
Every result you emit MUST be a single line beginning with `RESULT: ` — the
orchestrator only parses lines matching `^RESULT: `. Emit exactly one such line
as your final action.

## Control Plane — read and obey before anything else

1. **HALT check (FIRST ACTION).** If `{{REPO_ROOT}}/.kitchenloop/HALT` exists,
   print its contents, output `RESULT: STUCK: HALT sentinel present`, and STOP
   immediately. Do no other work.
2. **DIRECTIVE.** Read `{{REPO_ROOT}}/DIRECTIVE.md` — it is the human setpoint.
   If any action this pipeline would take matches its ALWAYS-HALT list
   (constitution amendments, canonical-schema version bumps/migrations,
   revenue-share or client-ownership semantics, changes to the loop's own gates,
   `git push` to `{{BASE_BRANCH}}` or any new remote, force-push, deploys), do
   NOT do it: add a row to `{{REPO_ROOT}}/OPERATOR-DESK.md` in the exact format
   that file documents (one table row plus one context paragraph below it),
   output `RESULT: STUCK: [reason]`, and stop. A gate that is not on the desk
   was not asked.
3. **No interactive operator.** Never use AskUserQuestion and never wait for
   human input. Every ask goes to `OPERATOR-DESK.md` as a row — never buried in
   a PR comment, prose, or chat.
4. **Push scope.** You MAY push fix commits to *this PR's own feature branch*
   (`{{HEAD_BRANCH}}`) — that is the authorized pr-manager path. You land the PR
   only via `gh pr merge` after every gate passes. You may NEVER `git push` to
   `{{BASE_BRANCH}}` directly, push to a new remote, force-push, or deploy;
   those ALWAYS halt to OPERATOR-DESK.md.

## Stage 1: Safety Checks

Verify:
- [ ] PR targets the correct base branch (`{{BASE_BRANCH}}`)
- [ ] PR is open and not in draft
- [ ] PR has no merge conflicts
- [ ] PR author is in the allowlist (if configured; empty = trust all)

If any check fails, output `RESULT: NOT_MERGEABLE: [reason]` and stop.

## Stage 1.5: Sealed-Path Guard (Hard Gate)

The loop may not merge changes to its own gates. List the PR's changed files:

```bash
gh pr diff {{PR_NUMBER}} --name-only
```

If ANY changed file is at or under one of these sealed paths, the loop may not
merge the PR:

- `.kitchenloop/quality-bar.md`
- `.kitchenloop/unbeatable-tests.md`
- `.kitchenloop/uat-cards/`
- `scripts/pr-manager/`
- `scripts/kitchenloop/prompts/`
- `kitchenloop.yaml`
- `DIRECTIVE.md`
- `OPERATOR-DESK.md`
- `.specify/memory/constitution.md`
- `docs/architecture/system-architecture.md`
- `.claude/agents/uat-evaluator.md`
- `.claude/skills/kitchenloop-quality-sweep/`

If there is any hit: a loop-authored change to a sealed gate is an operator
decision, not a loop merge. Add an OPERATOR-DESK.md row, output
`RESULT: NOT_MERGEABLE: touches sealed gate <file>`, and STOP.
(The orchestrator also enforces this mechanically before spawning you, so a hit
here means that guard was bypassed — treat it as blocking.)

## Stage 2: Worktree Setup

```bash
git fetch origin {{HEAD_BRANCH}}
git worktree add .claude/worktrees/pr-{{PR_NUMBER}} {{HEAD_BRANCH}}
cd .claude/worktrees/pr-{{PR_NUMBER}}
```

## Stage 3: Code Review (Hard Gate)

Run the `pr-auditor` agent (`.claude/agents/pr-auditor.md`) for a deep,
read-only review covering:

- Security vulnerabilities
- Logic errors
- Performance issues
- Test coverage gaps
- **Spec/architecture alignment** (see Stage 4a taxonomy): the reviewer MUST read
  the feature's `specs/<NNN-feature>/spec.md` and `plan.md` from this branch and
  check the implementation against them, not just review the code in isolation.
- **Required PR-body sections present** (INV-027, honesty gate). The PR body must
  contain:
  - a **Live Test Evidence** section with a verdict — PASS (with journey,
    evidence path, and log excerpts), or an explicit `N/A (no product behavior
    change)` / `SKIPPED (pre-skeleton)`;
  - a **Pre-Write Decision** section (reuse/extend/generalize/new) per the
    clean-architecture policy;
  - a **Spec Alignment** section citing the feature spec/plan (or `N/A` with
    reason).
  A missing section, or an `N/A` on a PR that visibly changes product behavior,
  is a **critical** finding (honesty violation, same class as a weakened
  assertion).

If **critical** issues found: fix them, commit, push to `{{HEAD_BRANCH}}`.
Re-run review.
If issues persist after 2 fix attempts: output `RESULT: STUCK: critical review issues` and stop.

## Stage 4: External Review — Multi-Model Tribunal

Collect independent reviews from all available external reviewers. Each reviewer
outputs `APPROVE` or `REQUEST_CHANGES` with specific feedback.

### 4a. Codex Review (primary external reviewer — spec/architecture/code alignment)
Run from inside the PR worktree so the diff is against the PR branch:
```bash
codex review --base {{BASE_BRANCH}} "Three-way ALIGNMENT review: verify that code, spec, and architecture agree for this feature PR.

Artifacts to read from this branch before judging the diff:
1. The feature spec: specs/<NNN-feature>/spec.md (requirements + acceptance criteria)
2. The feature plan: specs/<NNN-feature>/plan.md (module boundaries, data model, contracts)
3. The system architecture: docs/architecture/system-architecture.md (numbered invariants INV-NNN)
4. The constitution gates: .specify/memory/constitution.md and .kitchenloop/quality-bar.md ('The Bar')

Classify EVERY finding into exactly one state:
- VIOLATION    — code contradicts the spec or plan (blocking)
- CODE-MISSING — a spec requirement has no implementation and no recorded deferral (blocking)
- DRIFT        — implementation violates a system invariant (cite the INV-NNN id) or diverges from the plan's architecture: wrong module boundary, schema forked outside the canonical itinerary package, supplier API shapes outside the adapter, money path without state-conservation handling, procedure without role authorization (blocking)
- CODE-AHEAD   — implemented behavior with no basis in the spec/plan (scope creep; blocking unless trivially cosmetic)
- SPEC-SILENT  — significant implemented behavior the spec does not address (NOT blocking: report it so a spec-amendment ticket is filed; the spec evolves through SDD, code does not silently define it)

Then review correctness, security, and style as usual.
End your output with a line containing exactly APPROVE or REQUEST_CHANGES, then the findings list with each finding's state label, file, and evidence."
```
Timeout: 300s (or `reviewers.codex.timeout` in kitchenloop.yaml).

**Codex is a DIRECTIVE-named merge gate.** If codex times out or is unavailable,
you MUST NOT proceed on the strength of the other reviewers. Add an
OPERATOR-DESK.md row recording the codex outage for PR #{{PR_NUMBER}} (the codex
alignment review could not run), output
`RESULT: STUCK: codex review unavailable (merge gate)`, and stop. Never record
the outage only in a PR comment.

**Routing rule (double-loop split):** VIOLATION / CODE-MISSING / DRIFT / CODE-AHEAD
mean the *code* is wrong → fix autonomously in this pipeline. SPEC-SILENT means the
*spec* is wrong or incomplete → file a spec-amendment ticket (`improvement` type,
titled `spec-gap: ...`) and do NOT block the merge on it. Code fixes are autonomous;
spec changes go back through the SDD flow.

### 4b. Gemini Review (only if `reviewers.gemini.enabled: true` in kitchenloop.yaml)
```bash
gemini --approval-mode plan -p "Review this PR diff for: correctness, security, performance. Output APPROVE or REQUEST_CHANGES with specific feedback."
```
Timeout: 60s. If disabled in config, skip entirely (do not count it). If enabled
but it times out/errors, record as `UNAVAILABLE` and exclude it (gemini is not a
DIRECTIVE-named gate).

### 4c. Consensus Classification

Combine verdicts from Stage 3 (pr-auditor) and Stage 4a (codex, mandatory) plus
Stage 4b (gemini, if enabled) into a tribunal:

| All available reviewers | Classification | Action |
|---|---|---|
| All APPROVE | **CONFIRMED** | Proceed |
| Majority APPROVE | **LIKELY** | Proceed, log dissenting review in PR comment |
| Majority REQUEST_CHANGES | **FLAG** | Add `needs-attention` label, output `RESULT: STUCK: majority reviewer rejection` |
| All REQUEST_CHANGES | **BLOCKED** | Output `RESULT: STUCK: unanimous reviewer rejection` |

- Codex UNAVAILABLE never collapses the tribunal — it halts (see Stage 4a).
- With codex mandatory, at least two reviewers (pr-auditor + codex) always count.
- When only 2 reviewers are available: majority = both must agree.
- `UNAVAILABLE` (gemini only) reviewers are excluded from the count.
- If REQUEST_CHANGES from any reviewer: attempt to fix the feedback first, then re-evaluate.
  After 2 fix attempts, use the latest verdicts for final classification.

## Stage 5: Branch Update

Update the PR branch with the latest base branch:
```bash
git fetch origin {{BASE_BRANCH}}
git merge origin/{{BASE_BRANCH}} --no-edit
```

If conflicts: resolve them following `scripts/pr-manager/prompts/resolve-conflicts.md`
(prefer PR branch intent), commit, and push to `{{HEAD_BRANCH}}`.
If unresolvable: output `RESULT: STUCK: unresolvable conflicts` and stop.

## Stage 6: CI Wait & Fix (4 rounds max)

Wait for CI checks to complete. If checks fail:
1. Analyze the failure
2. Fix the issue
3. Push to `{{HEAD_BRANCH}}` and wait again
4. Repeat up to 4 times

If CI still fails after 4 rounds: label PR `needs-attention` and output `RESULT: STUCK: CI failures`.

## Stage 7: Review Bot Threads (4 rounds max)

**Skip this stage entirely if `pr_manager.review_bot` is empty in kitchenloop.yaml**
(no review bot is installed on this repo — Codex in Stage 4a is the external reviewer).

Check for unresolved review bot threads (e.g., CodeRabbit). For each:
1. Read the feedback
2. Either fix the issue or reply explaining why it's not applicable
3. Push changes to `{{HEAD_BRANCH}}`
4. **Poll for re-review** instead of sleeping a fixed duration. Review threads are
   only available via the GraphQL API (the REST `--json` field does not exist):

```bash
# Poll every 2 minutes, max 4 polls (8 minutes total)
read -r OWNER REPO < <(gh repo view --json owner,name \
  --jq '"\(.owner.login) \(.name)"')
for i in 1 2 3 4; do
  sleep 120
  unresolved=$(gh api graphql -f query='
    query($owner:String!,$repo:String!,$pr:Int!){
      repository(owner:$owner,name:$repo){
        pullRequest(number:$pr){
          reviewThreads(first:100){ nodes{ isResolved } }
        }
      }
    }' -F owner="$OWNER" -F repo="$REPO" -F pr={{PR_NUMBER}} \
    --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved==false)] | length')
  [ "$unresolved" -eq 0 ] && break
done
```

Do NOT use a hard `sleep 600` or similar — poll for review status completion.

If threads still unresolved after 4 rounds: continue (non-blocking).

## Stage 8: Final Check

Run one final Codex review (hard gate for critical issues):
```bash
codex review --base {{BASE_BRANCH}} "Final merge-safety review: is this PR safe to merge? Check only for critical issues (data loss, money-path bugs, schema breakage, security). End your output with a line containing exactly APPROVE or REJECT, with reason."
```
Timeout: 300s. Codex is a DIRECTIVE-named merge gate: if it is unavailable here,
you MUST NOT treat the PR as approved. Add an OPERATOR-DESK.md row recording the
codex outage for PR #{{PR_NUMBER}}, output
`RESULT: STUCK: codex final review unavailable (merge gate)`, and stop.

If REJECT with critical reason: output `RESULT: STUCK: final review rejection`.

## Gate Decision (end of preparation)

- If any stage above failed: output the appropriate `RESULT: STUCK: [reason]` or
  `RESULT: NOT_MERGEABLE: [reason]` line and STOP.
- If all stages passed AND `{{DRY_RUN}}` is `true`: output `RESULT: PREPPED` and
  STOP. This is a dry run — do NOT continue to any merge stage, and do NOT merge.
- If all stages passed AND `{{DRY_RUN}}` is `false`: continue to the merge stages
  below (Stage 8.5 onward).

## Worktree Cleanup

If you STOP at this stage (PREPPED / STUCK / NOT_MERGEABLE), clean up the worktree first:
```bash
git worktree remove .claude/worktrees/pr-{{PR_NUMBER}}
```

## Output

Emit exactly one line, as your final action:

- `RESULT: PREPPED` — all prep gates passed (dry run: not merged)
- `RESULT: STUCK: [reason]` — needs human attention (review/CI/codex-outage/UAT)
- `RESULT: NOT_MERGEABLE: [reason]` — cannot be merged (sealed path, wrong state, conflicts)
