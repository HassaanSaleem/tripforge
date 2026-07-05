# OPERATOR DESK — what the loop is waiting on YOU for

One row per pending human gate. The loop adds a row whenever it halts for the
operator; the operator answers by saying the exact word(s) in **Say**. Cleared
rows are removed (history lives in the loop state and git log). Empty table =
nothing is asked of you.

Rules for the loop:
- Every halt-for-the-operator MUST be a row here — never buried in prose or a PR
  comment. A gate that is not on the desk was not asked.
- Each row includes one short context paragraph directly below the table row it
  belongs to: what happened, the recommendation, and what stays blocked.
- Never edit or reinterpret an existing row's **Say** word; add a new row instead.

| ID | Say | Question | Recommendation | Since | Blocks |
|----|-----|----------|----------------|-------|--------|
| D-002 | `scope pushes` | DIRECTIVE's ALWAYS-HALT on "git push to any remote" contradicts the loop's own PR pipeline (every execute/merge path must push feature branches) and deadlocks iteration 1. | Amend the DIRECTIVE item to: halt on **pushes to `main` outside the gated pr-manager merge pipeline, pushes to new remotes, force-pushes, and deploys**; feature-branch pushes for PR creation are authorized. | 2026-07-05 | Iteration 1 (execute + merge paths) |
| D-003 | `align seals` | DIRECTIVE's sealed-gate list omits the pr-manager review stages and the architecture doc that CLAUDE.md seals — the two lists must be identical or the gap is exploitable. | Add "pr-manager review stages (`scripts/pr-manager/prompts/`)" and "`docs/architecture/system-architecture.md`" to DIRECTIVE's sealed list. | 2026-07-05 | Nothing (hardening) |

**D-002 context:** The pre-flight audit confirmed this as a blocker: DIRECTIVE.md:18
forbids all pushes while prompts/engine push in five places. Until you answer,
the engine's direct state-sync pushes to main are gated OFF behind config
(`repo.allow_state_sync_push: false`) and PR-branch pushes proceed per the
audit-fix recommendation. Saying `scope pushes` ratifies the scoped wording
(I apply the DIRECTIVE edit on your word).

**D-003 context:** Hardening only — the mechanical sealed-path deny list in
pr-manager now blocks loop merges to gate files regardless; this row just makes
the two documents agree.
