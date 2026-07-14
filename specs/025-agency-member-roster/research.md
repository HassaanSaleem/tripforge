# Phase 0 Research: Agency Member Roster

No [NEEDS CLARIFICATION] markers exist in the spec (see
`checklists/requirements.md`) and no unknown technology choice is involved —
this feature reuses the project's established tRPC/Drizzle service+router
pattern end to end. Research here documents the decisions made from direct
codebase inspection, not open questions.

## Decision: Reuse `agencyAdminProcedure`, do not add a new auth tier

**Rationale**: `packages/api/src/trpc.ts` already defines `agencyAdminProcedure`
(owner/admin only, built on `agentProcedure`), and its full ladder (owner
ALLOWED, admin ALLOWED, member FORBIDDEN, traveler FORBIDDEN, anon
UNAUTHORIZED) is pinned by `packages/api/src/__tests__/agency-admin-rbac.test.ts`
against a throwaway router. This is exactly the tier the spec calls for —
no new middleware needed.

**Alternatives considered**: A bespoke role check inside a new procedure —
rejected as pure duplication of an already-tested, already-shipped gate
(INV-023 requires authorization live in the procedure, not be reinvented
per-router).

## Decision: New service function `listAgencyMembers(db, agencyId)` in a new `services/agency-members.ts`

**Rationale**: Every existing agent-gated aggregate in this router family
(`dashboard-stats.ts`, `media.ts`, `trip-handoffs.ts`) is a plain async
function taking `(db-or-container, session/agencyId, ...)` and returning a
typed result — routers stay thin (`ctx.session`/`ctx.container` destructuring
+ one call). `dashboard-stats.ts` is the closest analog: single-agency-scoped
read aggregate, `Db` injected directly (no supply-adapter port needed since
this is pure Postgres data, not third-party inventory).

**Alternatives considered**: Putting the query inline in the router handler —
rejected; every other router in this codebase delegates to a service function,
and inlining would break the established layer boundary
(`.claude/skills/typescript-clean-architecture/SKILL.md`).

## Decision: Query via `packages/db`'s already-exported `member`/`user` tables and Drizzle operators — no new schema, no new db-level helper

**Rationale**: `packages/db/src/schema-auth.ts` already defines `member`
(`organizationId`, `userId`, `role`, `createdAt`) and `user` (`name`,
`email`), and `packages/db/src/index.ts` already exports both plus the
`eq`/`asc` operators the join needs. `packages/db/src/membership.ts` shows
the established pattern for small role/membership queries but its existing
functions (`getMemberRole`, `getPrimaryMembership`) return a single row, not
a roster — a new function is additive, not a modification of pinned
contracts.

**Alternatives considered**: Adding a `listMembers` helper inside
`packages/db/src/membership.ts` — considered but rejected in favor of keeping
the join (with `user.name`/`user.email` projection) in the API-layer service,
consistent with how `dashboard-stats.ts` composes multi-table Drizzle queries
directly rather than adding a single-purpose `packages/db` helper for each
one; `membership.ts`'s existing helpers are reused by the session-creation
path elsewhere and are deliberately minimal (single-row lookups), so the
roster projection does not belong there.

## Decision: Split testing between a DB-less RBAC test and a real-Postgres L3 test

**Rationale**: The spec's acceptance criteria requires five outcomes
(owner ALLOWED, admin ALLOWED, member FORBIDDEN, traveler FORBIDDEN, anon
UNAUTHORIZED) plus INV-004 tenant isolation. In this codebase's existing
convention (`marketplace-rbac.test.ts` vs `l3-marketplace.test.ts`,
`dashboard` has no plain RBAC file because `l3-dashboard-stats.test.ts`
covers its ladder inline), the FORBIDDEN/UNAUTHORIZED reject paths never
reach the database (the `agentProcedure`/`agencyAdminProcedure` middleware
throws before the handler runs) and so are tested without `DATABASE_URL`,
always running in `pnpm test`. The ALLOWED paths and tenant-isolation
assertion require real member rows in real, distinct agencies to prove
anything — those go in a new `l3-agency-admin.test.ts`, gated by
`describe.skipIf(!DATABASE_URL)` exactly like every sibling L3 suite, and
exercised for real during the Live Test & Fix / regress L3 boot.

**Alternatives considered**: Testing the ALLOWED path with a hand-rolled
in-memory fake `Db` — rejected; no such fake exists anywhere in this
codebase (every ALLOWED-path assertion for a DB-backed procedure is an L3
test against real Postgres), and inventing one here would be a new,
unreviewed test-infrastructure pattern for a small feature.

## Decision: No UI in this iteration

**Rationale**: The spec's Assumptions section and the source ticket both say
so explicitly; the acceptance criteria only requires "a router/procedure...
covered by tests," never a page. Adding one would be scope creep beyond what
was asked and beyond what the Explore-agent scoping pass sized this ticket
for (chosen specifically as the smallest of three low-priority candidate
tickets this cycle).
