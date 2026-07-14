# Phase 1 Data Model: Agency Member Roster

No schema change. This feature is a read-only projection over tables that
already exist in `packages/db/src/schema-auth.ts` (Better Auth core +
organization plugin). No migration, no new table, no new column.

## Entities (existing, reused)

### `organization` (the agency — INV-004 tenant key)

| Field  | Type | Notes                        |
|--------|------|-------------------------------|
| `id`   | text | tenant key, referenced as `agencyId` everywhere |
| `name` | text | agency display name (not part of the roster response) |

### `member` (an agency membership — the roster's row source)

| Field             | Type      | Notes |
|-------------------|-----------|-------|
| `id`              | text      | membership row id (not surfaced in the roster response) |
| `organizationId`  | text FK → `organization.id` | the tenant scope — every roster query filters on this |
| `userId`          | text FK → `user.id` | joined to `user` for name/email |
| `role`            | text      | `"owner" \| "admin" \| "member"` — surfaced as-is |
| `createdAt`       | timestamp | surfaced as `joinedAt` (ISO string) |

### `user` (joined for display fields)

| Field   | Type | Notes |
|---------|------|-------|
| `id`    | text | joined via `member.userId` |
| `name`  | text | surfaced as-is |
| `email` | text | surfaced as-is |

## New response shape (API layer only — not a DB table)

### `AgencyMemberSummary` (`packages/api/src/services/agency-members.ts`)

| Field      | Type   | Source                              |
|------------|--------|--------------------------------------|
| `userId`   | string | `member.userId`                     |
| `name`     | string | `user.name`                         |
| `email`    | string | `user.email`                        |
| `role`     | string | `member.role`                       |
| `joinedAt` | string (ISO 8601) | `member.createdAt.toISOString()` |

## Query shape

```
SELECT member.userId, member.role, member.createdAt, user.name, user.email
FROM member
INNER JOIN user ON member.userId = user.id
WHERE member.organizationId = :agencyId   -- INV-004 tenant scope, at the query
ORDER BY member.createdAt ASC
```

## Validation / state rules

- No mutation, no state transitions — this is a pure read.
- Tenant scoping (`organizationId = :agencyId`) is applied at the query
  itself, never filtered after the fact in the application layer (matches
  every existing tenant-scoped query in this codebase, e.g.
  `dashboard-stats.ts`).
- `agencyId` is always taken from the verified session
  (`ctx.session.agencyId` on `AgentSessionContext`), never accepted as
  caller-supplied input — there is no way to request another agency's
  roster by ID.
