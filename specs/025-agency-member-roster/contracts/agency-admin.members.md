# Contract: `workspace.agencyAdmin.members`

**Kind**: tRPC query procedure (mounted on the existing `appRouter`, consumed
in-process via `createAppCaller` by server components, or over HTTP by
`apps/web`/`apps/mobile`)

**Authorization tier**: `agencyAdminProcedure` (owner/admin only —
`packages/api/src/trpc.ts`)

## Input

None. The agency scope is always the caller's own verified session
(`ctx.session.agencyId`) — never a caller-supplied parameter.

## Output

`AgencyMemberSummary[]` (see `data-model.md`):

```ts
interface AgencyMemberSummary {
  userId: string;
  name: string;
  email: string;
  role: string;        // "owner" | "admin" | "member"
  joinedAt: string;     // ISO 8601
}
```

Ordered by `joinedAt` ascending (oldest member first — matches
`getPrimaryMembership`'s existing ordering convention in
`packages/db/src/membership.ts`).

## Error outcomes (the pinned ladder — INV-023)

| Caller                                   | Outcome | Code | Covered by |
|-------------------------------------------|---------|------|------------|
| Anonymous (no session)                    | Rejected | `UNAUTHORIZED` | `agency-admin-router-rbac.test.ts` |
| Traveler (session, no agency membership)  | Rejected | `FORBIDDEN` (message: /agency membership/i) | `agency-admin-router-rbac.test.ts` |
| Agency member (role = `"member"`)         | Rejected | `FORBIDDEN` (message: /owner or admin/i) | `agency-admin-router-rbac.test.ts` |
| Agency admin (role = `"admin"`)           | Allowed — full roster | — | `l3-agency-admin.test.ts` |
| Agency owner (role = `"owner"`)           | Allowed — full roster | — | `l3-agency-admin.test.ts` |

## Tenant isolation (INV-004)

The response NEVER includes a row whose `member.organizationId` differs from
the caller's own `agencyId` — enforced by the query's `WHERE` clause, proven
by `l3-agency-admin.test.ts`'s two-agency isolation assertion.

## Out of scope (this contract does not cover)

- Invite / remove / role-change mutations (FR-007) — read-only in this
  iteration.
- Billing data (FR-008) — no billing data model exists yet.
- Markup-policy administration (FR-008) — tracked separately (seed-0005).
- Pagination — full roster returned in one response (see spec Assumptions).
