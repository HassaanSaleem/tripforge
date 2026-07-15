# Implementation Plan: Traveler Client Accounts — Optional Sign-In on the Client View

**Branch**: `kitchen/fix-p2-consumer-accounts-identity-traveler-signin` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/030-traveler-client-accounts/spec.md`

## Summary

Add an optional traveler sign-in/sign-up to the `(client-view)` route group (new
`/view/sign-in` and `/view/sign-up` pages — static segments, so Next.js resolves them
ahead of the existing `/view/[token]` dynamic route with zero conflict) and a new
`clientView.me` procedure that echoes the signed-in caller's own name/email. When a
signed-in traveler opens a shared trip and picks "Have an agent arrange this for me,"
the form pre-fills from that identity; anonymous visitors see byte-identical behavior to
today. **No schema/migration is required**: the traveler identity is the ALREADY-EXISTING
org-less Better Auth `user` (an agency-less user is already what `getSessionContext`
treats as a traveler — see research below), so this plan's Constitution IV / HALT
migration-note requirement is satisfied by documenting that nothing changes on
`user`/`session`/`member`. Sign-up on the client-view intentionally skips the
`createAndActivateAgency` step the workspace sign-up chains — the resulting account is,
and stays, a traveler.

## Technical Context

**Language/Version**: TypeScript (pnpm + turborepo monorepo, existing tsconfig)

**Primary Dependencies**: Better Auth (`email/password`, already-installed `organization`
plugin — untouched), Drizzle ORM (Postgres), tRPC + zod, Next.js App Router — no new
package dependencies

**Storage**: PostgreSQL — **zero new tables, zero new columns**. The traveler identity is
the existing `user` row with no `member` row; `getSessionContext`
(`apps/web/lib/auth.ts:53-67`) already derives `{ userId }` (no `agencyId`/`agencyRole`)
for exactly this case today, proven by the existing L3 fixture
`const traveler: SessionContext = { userId: ... }` in
`packages/api/src/__tests__/l3-client-view.test.ts:151`. This is the additive,
backfill-free migration note the ticket's HALT requires: **there is no migration**,
because the identity already exists structurally — the schema/auth HALT is satisfied by
this plan reusing what's there rather than adding anything (operator-ratified at merge
per P2-IDENTITY-GATE, same discipline as SCHEMA-GATE-78; if design turns up a need for a
genuinely new column/table, it must be called out and gated the same way — none is
needed here).

**Testing**: Vitest (L1/L2 service tests), Vitest L3 against real Postgres
(`packages/api/src/__tests__/l3-traveler-accounts.test.ts`, env-gated on `DATABASE_URL`,
mirroring `l3-trip-handoffs.test.ts`/`l3-client-view.test.ts`), Playwright e2e for the
sign-in/sign-up/prefill journey, Playwright MCP live journey (INV-027)

**Target Platform**: Existing web app (`apps/web`, Next.js App Router) + `packages/api`
tRPC surface; no mobile UI in this cycle

**Project Type**: Web application (monorepo: packages + apps/web)

**Performance Goals**: N/A beyond existing app conventions — `clientView.me` is a single
indexed primary-key select by `userId`, no new latency-sensitive path

**Constraints**: Anonymous access to `/view/<token>` and `requestHandoff` MUST regress
zero (INV-018); the client-view sign-in/sign-up MUST NOT expose or reach any
agency-creation step or workspace navigation (INV-024, spec 010 FR-010); no
agent-confidential value (net rate, markup, budget allocation, platform branding) may
ever appear in the client-view or handoff payload regardless of session state (INV-020,
spec 010 FR-007); not a money path — no payment/markup/revenue-share touched, so no L3
concurrency/conservation treatment is required (same class as spec 022)

**Scale/Scope**: 0 new tables, 1 new DB helper (`getUserIdentity`), 1 extended router
(`clientViewRouter`, +1 `protectedProcedure` query), 2 new page routes + 2 new form
components (client-view sign-in/sign-up), 1 relocated shared-primitives file
(`auth-form.tsx`, moved from `(workspace)/` to `lib/` since a second route group now
needs it), 1 extended component (`TripFork`, +identity prop +account strip), 1 new L3
test file, 1 new e2e spec

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Marketplace-First | Strengthens the existing request-an-agent funnel (Constitution I's named mechanism for keeping "the consumer surface feeding the marketplace") by removing retyping friction on an already-shipped P0 feature (spec 022) — it does not add new planning/booking surface, it makes the existing funnel faster to use | PASS |
| II. Agent Experience Is the Wedge | No workspace/agent-facing change beyond an unused-until-now `protectedProcedure` middleware tier; zero regression risk to the builder or time-to-client-ready-itinerary | PASS |
| III. Budget-Aware AI Priced Against Reality | N/A — no planner/pricing involvement | N/A |
| IV. Canonical Itinerary Schema | NO schema change — not even an auth-adjacent one. The traveler identity is the pre-existing org-less `user` row; `user`/`session`/`member` are untouched (see Storage above). No migration note beyond documenting that none is needed | PASS |
| V. Integrate Supply, Don't Contract It | N/A — no supply-adapter involvement | N/A |
| VI. Trust, Provenance & Revenue-Share Integrity | Not a money path. Trust boundary is identity/tenant scoping, not revenue: `clientView.me` returns ONLY the caller's own `{name, email}` (no cross-user/cross-tenant read possible — the query is keyed on `ctx.session.userId`, which the session middleware derives server-side, never client input); a traveler session is provably barred from every `workspace.*` (agent) procedure by the pre-existing `agentProcedure` middleware (INV-023/024), exercised by a new L3 assertion. INV-020 (no markup/net-rate/branding leak) is re-verified across all three session states as a regression gate on the existing allowlist projection, which this feature does not modify | PASS |
| MVP Scope Discipline (P0 vs P1+/non-goals) | This ticket promotes ONLY the traveler-identity slice of the P2 consumer-surface roadmap tier (constitution `## MVP Scope Discipline`, P2 line) — explicit, bounded, operator-authorized 2026-07-15 via **P2-IDENTITY-GATE** ("Build now, ratify at merge" — OPERATOR-DESK.md, resolved). System-architecture.md §1.4 already textually anticipates this exact slice: "View/approve via share links **or lightweight account**; full self-serve planner is P2" — this plan builds the "lightweight account" carve-out, explicitly NOT the full self-serve consumer AI planner or the PRD non-goal "generic consumer planner." The companion ticket `p2-consumer-trip-history` (a client<->trip/booking association / "My Trips" history) is explicitly OUT of this plan's scope and remains blocked on its own separate gate (**P2-HISTORY-GATE**, still open on the desk) | PASS (scoped, operator-authorized) |

**Result**: No unjustified violations. The one roadmap-phase flag (MVP Scope Discipline)
is resolved by a named, dated operator authorization (P2-IDENTITY-GATE), not waived
silently. No Complexity Tracking entries required. Per the ticket's own HALT clause, this
PR stays operator-gated at merge (no auto-merge) even though Constitution Check passes —
the operator ratifies the identity-model choice at merge time, same discipline as
SCHEMA-GATE-78.

## Project Structure

### Documentation (this feature)

```text
specs/030-traveler-client-accounts/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/db/src/
├── membership.ts                     # EDIT — add getUserIdentity(db, userId): {name,email}|undefined, sibling to getMemberRole/getPrimaryMembership/getOrganizationName
└── index.ts                          # EDIT — export getUserIdentity

packages/api/src/services/
└── client-view.ts                    # EDIT — add TravelerIdentity type + getSignedInIdentity(container, userId), same inline `const db = container.db; if (!db) throw ...` style already used in this file (createShareLink/resolveShareLink)

packages/api/src/routers/
└── client-view.ts                    # EDIT — add `me: protectedProcedure.query(...)` (first use of the existing-but-unused protectedProcedure tier)

packages/api/src/index.ts             # EDIT — export TravelerIdentity (TS4023 convention, mirrors ClientItineraryView)

apps/web/lib/
└── auth-form.tsx                     # MOVE from apps/web/app/(workspace)/auth-form.tsx — a second route group now needs CredentialsFields/useSubmitState, so the shared primitives move to a neutral, non-route-group location (the file's own comment invites exactly this: "extend if a third auth surface needs it")

apps/web/app/(workspace)/sign-in/sign-in-form.tsx     # EDIT — import path only (../../../lib/auth-form.js)
apps/web/app/(workspace)/sign-up/sign-up-form.tsx     # EDIT — import path only (../../../lib/auth-form.js)

apps/web/app/(client-view)/view/sign-in/
├── page.tsx                          # NEW — server component: redirect if already signed in, else render the form; static segment wins over /view/[token]
└── client-sign-in-form.tsx           # NEW — client component: signInWithEmail (reused as-is from auth-client.ts, no new wrapper) + redirect to ?token's trip page

apps/web/app/(client-view)/view/sign-up/
├── page.tsx                          # NEW — server component, same redirect-if-signed-in shape
└── client-sign-up-form.tsx           # NEW — client component: signUpWithEmail ONLY (no createAndActivateAgency call — this is the entire mechanism that keeps the account a traveler)

apps/web/app/(client-view)/view/[token]/
├── page.tsx                          # EDIT — fetch optional identity via a new authenticated-or-anonymous caller, pass to <TripFork identity={...}>
└── trip-fork.tsx                     # EDIT — accept `identity` prop; pre-fill contactName/contactEmail via defaultValue (still-editable, uncontrolled inputs — no behavior change to the submit path); render a small sign-in/sign-out strip

apps/web/lib/trpc/server.ts           # EDIT — add getAuthenticatedCaller(headers): wraps the existing createTrpcContext(headers) (already derives session via getSessionContext) with createCallerFactory; reused for BOTH itinerary (unchanged: publicProcedure ignores session) and the new me query — zero extra session-derivation cost

apps/web/lib/trpc/client.ts           # EDIT — export ClientViewMeOutput via inference (existing convention)

packages/api/src/__tests__/
└── l3-traveler-accounts.test.ts      # NEW — real-Postgres: anonymous unaffected, traveler `me` returns own identity, cross-traveler isolation, traveler barred from every workspace.* procedure (INV-024), agent's own `me` also works (FR-005), INV-020 payload negative-checks across all three session states

tests/e2e/
└── traveler-account-journey.spec.ts  # NEW — Playwright: sign up as traveler (no agency step reachable) → open a shared trip → form pre-filled → sign out → form reverts to blank/editable
```

**Structure Decision**: No new package. `getSignedInIdentity` lives in
`packages/api/src/services/client-view.ts` alongside `resolveShareLink` — it is a
client-view-surface concern (what a visitor to `/view/*` is allowed to read about
themselves), not a workspace or marketplace concern, matching the existing file's scope.
`getUserIdentity` lives in `packages/db/src/membership.ts` alongside the other three
session-identity queries (`getMemberRole`/`getPrimaryMembership`/`getOrganizationName`) —
same file, same "app layer never builds ORM predicates" discipline the file's own header
comment states. `auth-form.tsx` moves out of `(workspace)/` into `apps/web/lib/` because,
for the first time, a second route group needs it — this is the file's own documented
extension trigger, not new abstraction.

## Pre-Write Discipline (recorded per `.claude/skills/typescript-clean-architecture/SKILL.md`)

- **`getUserIdentity` (packages/db/src/membership.ts)**: **extend** — one more
  session-identity query alongside `getMemberRole`/`getPrimaryMembership`/
  `getOrganizationName` in the same file; no existing function returns a user's own
  name/email today.
- **`getSignedInIdentity` (packages/api/src/services/client-view.ts)**: **extend** — same
  file as `resolveShareLink`/`createShareLink`; reuses the file's existing inline
  `db`-guard style rather than importing `trip-handoffs.ts`'s `requireDb` (keeps the file
  internally consistent rather than cross-importing a same-shape 3-line guard).
- **`clientView.me` (packages/api/src/routers/client-view.ts)**: **extend** — one more
  procedure on the existing 2-procedure router; first caller of the pre-existing
  `protectedProcedure` middleware tier (`packages/api/src/trpc.ts:19-24`), which was
  defined but never mounted anywhere — genuinely new capability, not a duplicate.
- **`auth-form.tsx` (`CredentialsFields`/`useSubmitState`)**: **reuse (relocated)** — the
  file's own header comment invites exactly this ("extend if a third auth surface needs
  it, don't generalize further until it does"); moving it to `apps/web/lib/` is the
  minimal change that lets `(client-view)` import it without reaching into `(workspace)/`
  — no new abstraction, no behavior change to the two existing forms beyond their import
  path.
- **`signInWithEmail`/`signUpWithEmail` (`apps/web/lib/auth-client.ts`)**: **reuse
  as-is** — both are already agency-agnostic (agency creation is the separate
  `createAndActivateAgency` call the workspace sign-up chains); the client-view sign-up
  simply never makes that second call. No new wrapper function needed.
- **`signOut` (`apps/web/lib/auth-client.ts`)**: **reuse as-is** — already generic,
  no agency-specific behavior.
- **`getAuthenticatedCaller` (`apps/web/lib/trpc/server.ts`)**: **new, but a thin
  wrapper** — `createCallerFactory` + the file's own pre-existing `createTrpcContext`
  (already used by the mounted HTTP route); `getAnonymousCaller` is the existing
  zero-session precedent for exactly this shape, extended for the signed-in case.
- **`TripFork` prefill**: **extend** — adds one prop and two `defaultValue`s to existing
  uncontrolled `<input>`s; the submit handler (`FormData`-based) is untouched, so the
  anonymous/no-identity path is byte-identical to today (an `undefined` `defaultValue` is
  a no-op).
- **New table/package**: **none** — no capability here is orthogonal enough to justify
  either.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty. The one roadmap-phase flag
(MVP Scope Discipline) is resolved by a cited, dated operator authorization
(P2-IDENTITY-GATE), not a violation requiring justification.*
