# Implementation Plan: Agent Sign-In / Session-Establishment UI

**Branch**: `kitchen/fix-seed-0008-sign-in-ui` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-agent-sign-in/spec.md` (ticket seed-0008; folds in triage IMP-2)

## Summary

Add the missing browser session-establishment surface for the agent-side MVP:
`/sign-in` (email + password) and `/sign-up` (account + agency, self-serve owner
onboarding) pages on the platform-branded workspace side, sign-out from the
workspace, and a server-side session hook that automatically activates the
user's (single) agency membership so agent-gated tRPC procedures pass without a
manual "select agency" step. The workspace greeting is upgraded from raw IDs to
human names (user name, agency name, role — IMP-2). Everything reuses the
already-wired Better Auth server (email+password + organization plugin) and the
existing tRPC role ladder; no new packages, no new tables, no money paths, no
canonical-schema change.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict), Node 20, React 19

**Primary Dependencies**: Next.js 15 app router (`apps/web`), Better Auth ^1.2.7
(already a dependency of `apps/web`; adds client-side usage via
`better-auth/react` + `organizationClient` plugin — no new package), tRPC v11
(`packages/api`, unchanged surface), Drizzle (`packages/db`)

**Storage**: PostgreSQL via `packages/db` (existing Better Auth tables `user`,
`session.active_organization_id`, `organization`, `member` — NO new tables, NO
migration)

**Testing**: Vitest (L1/L2 + env-gated L3 against real Postgres), Playwright e2e
against the built compose image (INV-027), L3 smoke `tests/integration/smoke.mjs`

**Target Platform**: Vercel serverless contract (INV-028) — verified locally on
the docker-compose built image

**Project Type**: Web application (existing turborepo: `apps/web` + `packages/*`)

**Performance Goals**: Session establishment adds exactly one indexed membership
lookup per session CREATION (not per request); sign-in → workspace journey < 60s
(SC-001)

**Constraints**: INV-023 (per-procedure authorization unchanged), INV-024
(platform-branded surfaces only; client-view untouched), INV-020 (no platform
branding on `/view` — existing negative e2e must stay green), INV-028 (stateless
serverless: hook state persists on the session row, never in process memory),
INV-004 (agencyId tenant scope comes from the session's active organization)

**Scale/Scope**: 2 new pages + 1 client auth helper + 1 sign-out button, 2 small
`packages/db` membership helpers, 1 Better Auth config hook, workspace greeting
rewrite, 1 new e2e spec, 1 env-gated L3 helper test

## Constitution Check

*GATE: evaluated before Phase 0 research; re-evaluated after Phase 1 design — both PASS, no violations to justify.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Marketplace-First | PASS | Sign-in unlocks every authenticated agent journey (build → book → trade UI to follow in seed-0009a–d); grows the installed agent base that feeds marketplace liquidity. No consumer-surface work (P2 untouched). |
| II. Agent Experience Is the Wedge | PASS | Removes the single biggest agent-experience blocker (no browser way in). Client-facing output untouched; workspace/platform branding stays on the workspace side (INV-024). |
| III. Budget-Aware AI | PASS (N/A) | No AI/planner behavior changes; no unpriced planner output introduced. |
| IV. Canonical Itinerary Schema | PASS | Schema not touched; no layer forks it. No version bump, no migration note needed. |
| V. Integrate Supply, Don't Contract It | PASS | No supplier surfaces; no supply-adapter changes. |
| VI. Trust, Provenance & Revenue-Share | PASS | No money paths (no L3 money-conservation obligations triggered). Sign-up grants *agenthood*, not marketplace *listing eligibility* — the spec-006 vetting gate (`agencyVetting`, both-sides-vetted at license time) is unchanged and keeps gating supply. |
| Non-Goals / MVP discipline | PASS | P0 agent-side item (the MVP explicitly requires agent sign-in — iteration-2 report FEAT-2). No P1+/non-goal surface. |
| PMF instrumentation | PASS (N/A) | Sign-in is not trip creation, booking, or a marketplace transaction; no PMF event is defined for it (PRD §12 metrics unaffected). |
| Development workflow | PASS | SDD flow (this spec/plan/tasks); live verification per INV-027 planned; simplicity default honored (reuses Better Auth surfaces instead of new endpoints). |

**Post-design re-check (after Phase 1)**: PASS — design added no new packages,
tables, endpoints, or scope beyond the spec; the only cross-package addition is
two read-only membership helpers inside `packages/db`'s existing encapsulation
pattern.

## Project Structure

### Documentation (this feature)

```text
specs/007-agent-sign-in/
├── spec.md              # Feature spec (done)
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D9
├── data-model.md        # Phase 1 — entities touched, session state transitions
├── quickstart.md        # Phase 1 — live validation guide
├── contracts/
│   └── session-establishment.md   # UI routes + session-context + helper contracts
├── checklists/requirements.md     # Spec quality checklist (done)
└── tasks.md             # Phase 2 (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/web/
├── lib/
│   ├── auth.ts                    # EXTEND: databaseHooks (auto-activate agency on
│   │                              #   session creation); greeting identity helper
│   └── auth-client.ts             # NEW: Better Auth React client (+ organization plugin)
├── app/
│   ├── (workspace)/
│   │   ├── sign-in/page.tsx       # NEW: server wrapper (redirect if agent) + form
│   │   ├── sign-in/sign-in-form.tsx    # NEW: client component
│   │   ├── sign-up/page.tsx       # NEW: server wrapper + form
│   │   ├── sign-up/sign-up-form.tsx    # NEW: client component (account + agency)
│   │   └── workspace/
│   │       ├── page.tsx           # EXTEND: human-name greeting (IMP-2), sign-in link,
│   │       │                      #   sign-out button; membership prompt preserved
│   │       └── sign-out-button.tsx     # NEW: client component
│   └── page.tsx                   # EXTEND: link to /sign-in
packages/db/src/
├── membership.ts                  # EXTEND: getPrimaryMembership(db, userId),
│                                  #   getOrganizationName(db, organizationId)
├── __tests__/membership.test.ts   # NEW: env-gated L3 helper tests (real Postgres)
└── index.ts                       # EXTEND: export the two helpers
tests/e2e/
└── sign-in.spec.ts                # NEW: sign-up → workspace(names) → sign-out →
                                   #   sign-in → workspace; wrong-password negative
```

**Structure Decision**: everything lands in the existing `apps/web` +
`packages/db` layout. Auth stays framework-touching only in `apps/web/lib`
(established seed-0001 pattern: "the ONLY place the Better Auth runtime type is
touched"); ORM predicates stay inside `packages/db` (INV-017 — membership.ts's
own stated purpose). No new workspace package.

## Complexity Tracking

No Constitution Check violations — table intentionally empty.
