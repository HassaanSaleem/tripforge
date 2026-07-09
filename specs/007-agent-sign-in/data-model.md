# Data Model: Agent Sign-In / Session-Establishment UI

**Feature**: specs/007-agent-sign-in | **Date**: 2026-07-09

**No new tables. No migrations. No canonical-itinerary-schema change.**
This feature only *uses* the Better Auth tables that seed-0001 already created
in `packages/db/src/schema.ts`.

## Entities touched (existing)

### `user` (Better Auth)
- `id` — referenced by memberships and sessions
- `name` — **now user-visible** (workspace greeting, IMP-2)
- `email`, hashed credential via `account` — sign-in/sign-up input

### `session` (Better Auth)
- `activeOrganizationId` (`active_organization_id`, FK → `organization.id`) —
  the field this feature starts writing: set at session creation by the D1
  hook (primary membership) or by explicit `organization.setActive` (sign-up
  flow). `NULL` = traveler session. Read per request by `getSessionContext`
  (unchanged).

### `organization` (agency, Better Auth organization plugin)
- `id` — the tenant key (INV-004)
- `name` — **now user-visible** (workspace greeting)
- `slug` — unique; sign-up generates `slugify(name)-<random suffix>`

### `member`
- `(organizationId, userId, role)` — created as `owner` by the organization
  plugin during sign-up's `organization.create`; read by the D1 hook
  (primary membership = oldest `createdAt`) and by `getSessionContext`
  (role re-verification, unchanged)

## Session-context state transitions

| From | Event | To | Mechanism |
|------|-------|----|-----------|
| anonymous | sign-in (has membership) | agent (`userId`+`agencyId`+`agencyRole`) | session created → D1 hook persists `activeOrganizationId` |
| anonymous | sign-in (no membership) | traveler (`userId` only) | D1 hook finds no membership; leaves field NULL |
| anonymous | sign-up (account+agency) | agent (owner) | session created (no org yet) → `organization.create` (owner member) → `organization.setActive` updates session row |
| agent / traveler | sign-out | anonymous | Better Auth deletes the session |

Invariant preserved (INV-023): `getSessionContext` still re-verifies the
membership role on every request — a stale/revoked membership never yields
agent privileges just because `activeOrganizationId` is set.

## New read-only query helpers (`packages/db/src/membership.ts`)

| Helper | Signature | Semantics |
|--------|-----------|-----------|
| `getPrimaryMembership` | `(db, userId) → Promise<{organizationId, role} \| undefined>` | Oldest membership by `createdAt` (P0 single-agency assumption); `undefined` when none |
| `getOrganizationName` | `(db, organizationId) → Promise<string \| undefined>` | `organization.name` lookup for the greeting |
