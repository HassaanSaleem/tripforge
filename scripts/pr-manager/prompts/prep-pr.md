# PR Preparation Pipeline

You are preparing PR #{{PR_NUMBER}} for merge. Follow this 8-stage pipeline strictly.

## Stage 1: Safety Checks

Verify:
- [ ] PR targets the correct base branch
- [ ] PR is open and not in draft
- [ ] PR has no merge conflicts
- [ ] PR author is in the allowlist (if configured; empty = trust all)

If any check fails, output `NOT_MERGEABLE: [reason]` and stop.

## Stage 2: Worktree Setup

```bash
git worktree add .claude/worktrees/pr-{{PR_NUMBER}} pr-branch-name
cd .claude/worktrees/pr-{{PR_NUMBER}}
```

## Stage 3: Code Review (Hard Gate)

Run the pr-auditor agent for a deep review:
- Security vulnerabilities
- Logic errors
- Performance issues
- Test coverage gaps
- **Spec/architecture alignment** (see Stage 4a taxonomy): the reviewer MUST read
  the feature's `specs/<NNN-feature>/spec.md` and `plan.md` from this branch and
  check the implementation against them, not just review the code in isolation.

If **critical** issues found: fix them, commit, push. Re-run review.
If issues persist after 2 fix attempts: output `STUCK: critical review issues` and stop.

## Stage 4: External Review — Multi-Model Tribunal

Collect independent reviews from all available external reviewers. Each reviewer
outputs `APPROVE` or `REQUEST_CHANGES` with specific feedback.

### 4a. Codex Review (primary external reviewer — spec/architecture/code alignment)
Run from inside the PR worktree so the diff is against the PR branch:
```bash
codex review --base main "Three-way ALIGNMENT review: verify that code, spec, and architecture agree for this feature PR.

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
Timeout: 300s. If timeout or unavailable, record as `UNAVAILABLE` — and note the
failure in the PR comment so a silently-missing reviewer is visible to the operator.

**Routing rule (double-loop split):** VIOLATION / CODE-MISSING / DRIFT / CODE-AHEAD
mean the *code* is wrong → fix autonomously in this pipeline. SPEC-SILENT means the
*spec* is wrong or incomplete → file a spec-amendment ticket (`improvement` type,
titled `spec-gap: ...`) and do NOT block the merge on it. Code fixes are autonomous;
spec changes go back through the SDD flow.

### 4b. Gemini Review (if enabled in config: `reviewers.gemini.enabled: true`)
```bash
gemini --approval-mode plan -p "Review this PR diff for: correctness, security, performance. Output APPROVE or REQUEST_CHANGES with specific feedback."
```
Timeout: 60s. If timeout or unavailable, record as `UNAVAILABLE`.

### 4c. Consensus Classification

Combine verdicts from Stage 3 (pr-auditor) and Stage 4a/4b into a tribunal:

| All available reviewers | Classification | Action |
|---|---|---|
| All APPROVE | **CONFIRMED** | Proceed |
| Majority APPROVE | **LIKELY** | Proceed, log dissenting review in PR comment |
| Majority REQUEST_CHANGES | **FLAG** | Add `needs-attention` label, output `STUCK: majority reviewer rejection` |
| All REQUEST_CHANGES | **BLOCKED** | Output `STUCK: unanimous reviewer rejection` |

- When only 2 reviewers available: majority = both must agree.
- When only 1 reviewer available: use that single verdict (no consensus).
- `UNAVAILABLE` reviewers are excluded from the count.
- If REQUEST_CHANGES from any reviewer: attempt to fix the feedback first, then re-evaluate.
  After 2 fix attempts, use the latest verdicts for final classification.

## Stage 5: Branch Update

Update the PR branch with the latest base branch:
```bash
git fetch origin main
git merge origin/main --no-edit
```

If conflicts: resolve them (prefer PR branch intent), commit, push.
If unresolvable: output `STUCK: unresolvable conflicts` and stop.

## Stage 6: CI Wait & Fix (4 rounds max)

Wait for CI checks to complete. If checks fail:
1. Analyze the failure
2. Fix the issue
3. Push and wait again
4. Repeat up to 4 times

If CI still fails after 4 rounds: label PR `needs-attention` and output `STUCK: CI failures`.

## Stage 7: Review Bot Threads (4 rounds max)

**Skip this stage entirely if `pr_manager.review_bot` is empty in kitchenloop.yaml**
(no review bot is installed on this repo — Codex in Stage 4a is the external reviewer).

Check for unresolved review bot threads (e.g., CodeRabbit). For each:
1. Read the feedback
2. Either fix the issue or reply explaining why it's not applicable
3. Push changes
4. **Poll for re-review** instead of sleeping a fixed duration:

```bash
# Poll every 2 minutes, max 4 polls (8 minutes total)
for i in 1 2 3 4; do
  sleep 120
  unresolved=$(gh pr view {{PR_NUMBER}} --json reviewThreads --jq \
    '[.reviewThreads[] | select(.isResolved == false)] | length')
  [ "$unresolved" -eq 0 ] && break
done
```

Do NOT use a hard `sleep 600` or similar — poll for review status completion.

If threads still unresolved after 4 rounds: continue (non-blocking).

## Stage 8: Final Check

Run one final Codex review (hard gate for critical issues):
```bash
codex review --base main "Final merge-safety review: is this PR safe to merge? Check only for critical issues (data loss, money-path bugs, schema breakage, security). End your output with a line containing exactly APPROVE or REJECT, with reason."
```
Timeout: 300s. If Codex is unavailable here, treat as APPROVE only when Stage 3
(pr-auditor) and Stage 4 both passed — and record the gap in the PR comment.

If REJECT with critical reason: output `STUCK: final review rejection`.

## Output

If all stages pass: output `PREPPED` (ready for merge, but do NOT merge).
Otherwise: output `STUCK: [reason]` or `NOT_MERGEABLE: [reason]`.

## Worktree Cleanup

Always clean up the worktree when done:
```bash
git worktree remove .claude/worktrees/pr-{{PR_NUMBER}}
```
