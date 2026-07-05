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
| D-004 | `wire skeleton gates` | seed-0001 landed the runnable skeleton (Next.js/tRPC/Better Auth/Drizzle), an L3 smoke script, the Playwright live-verification harness, and CI — all built but NOT self-wired (the loop may not edit the sealed `kitchenloop.yaml`). May I apply the four config values below? | Apply after the seed-0001 PR merges; flip `require_ci` only once the CI run is green. | 2026-07-05 | INV-027 live verification exiting pre-skeleton mode; CI gating merges. |

**D-004 context** — seed-0001 (PR `kitchen/fix-seed-0001-bootstrap-skeleton`)
delivers the runnable web service plus its verification harness, but per DIRECTIVE
(sealed regulator: `kitchenloop.yaml`) the loop cannot wire its own oracle/gates.
Once the PR merges, set in `kitchenloop.yaml`:

- `verification.oracle.smoke_command`: `node tests/integration/smoke.mjs`
- `verification.live.boot_command`: `docker compose down -v && docker compose up --build --wait`
- `verification.live.e2e_command`: `npx playwright test`
- `pr_manager.require_ci`: `true` — **only after** the `.github/workflows/ci.yml`
  run is green on the merged commit (flipping it before CI is green would deadlock
  merges).

Recommendation: apply all four. Until then, INV-027 live verification stays in the
pre-skeleton carve-out (execute records `SKIPPED (pre-skeleton)`), and merges are
not CI-gated. Nothing else is blocked — the skeleton's `npm test` / `npm run lint`
already pass and gate PRs.

<!-- Resolved 2026-07-05 (operator ratified both at iteration-1 kickoff):
     D-002 `scope pushes` — DIRECTIVE item 2 push rule scoped to halt only on
       pushes to main outside the gated pr-manager merge pipeline, pushes to new
       remotes, force-pushes, and deploys; feature-branch pushes authorized.
       Direct state-sync pushes to main remain gated off (repo.allow_state_sync_push
       stays false — those are pushes to main outside the merge pipeline).
     D-003 `align seals` — DIRECTIVE sealed-gate list now names the pr-manager
       review stages (scripts/pr-manager/prompts/) and system-architecture.md,
       matching CLAUDE.md. -->

