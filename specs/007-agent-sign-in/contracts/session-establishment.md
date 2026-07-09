# Contract: Session Establishment Surfaces

**Feature**: specs/007-agent-sign-in | **Date**: 2026-07-09

## 1. UI routes (new/changed)

| Route | Group | Contract |
|-------|-------|----------|
| `/sign-in` | `(workspace)` | Email + password form. Success → `/workspace`. Failure → stays, shows "Invalid email or password." (no session). Visitor with an existing **agent** session → redirected to `/workspace`. Links to `/sign-up`. |
| `/sign-up` | `(workspace)` | Name + email + password + agency-name form. Success → account created, agency created with caller as `owner`, agency set active, → `/workspace`. Duplicate email → human-readable error, no duplicate account. Links to `/sign-in`. |
| `/workspace` | `(workspace)` | **Agent session**: greeting shows user display name, agency name, and role — never raw IDs; renders a sign-out control. **Non-agent** (anonymous or traveler): keeps showing the membership prompt (the string `agency membership` must remain — pinned by smoke.spec) and now links to `/sign-in`. |
| `/` | root | Adds a link to `/sign-in`. Platform branding unchanged. |
| `/view` | `(client-view)` | **Untouched.** No sign-in chrome, no platform branding (INV-020 negative e2e must stay green). |

## 2. HTTP surface

No new endpoints. All calls go to the **existing** Better Auth catch-all
(`apps/web/app/api/auth/[...all]/route.ts`):

- `POST /api/auth/sign-in/email` — driven by the sign-in form
- `POST /api/auth/sign-up/email` — driven by the sign-up form
- `POST /api/auth/organization/create` — sign-up step 2 (caller becomes owner)
- `POST /api/auth/organization/set-active` — sign-up step 3
- `POST /api/auth/sign-out` — sign-out button

## 3. Session-context derivation (change to `apps/web/lib/auth.ts`)

- **NEW (D1 hook)**: on session creation, `activeOrganizationId` :=
  `getPrimaryMembership(db, userId)?.organizationId ?? null`.
- **UNCHANGED**: `getSessionContext(headers)` mapping — no session → `null`;
  session without active org or without a verified membership role →
  `{userId}` (traveler); session + active org + verified member role →
  `{userId, agencyId, agencyRole}` (agent). The INV-023 tRPC ladder
  (`protectedProcedure` / `agentProcedure` / `agencyAdminProcedure`) is not
  modified by this feature.

## 4. `packages/db` public-surface additions

```ts
// packages/db/src/membership.ts (exported via packages/db/src/index.ts)
getPrimaryMembership(db: Db, userId: string):
  Promise<{ organizationId: string; role: string } | undefined>
getOrganizationName(db: Db, organizationId: string):
  Promise<string | undefined>
```

Read-only; no supplier shapes; no money math.

## 5. Authorization ladder (must-not-change)

| Caller | Agent-gated procedure (e.g. `workspace.whoami`) | Workspace page |
|--------|--------------------------------------------------|----------------|
| anonymous | `UNAUTHORIZED` | membership prompt + sign-in link |
| traveler (no membership) | `FORBIDDEN` | membership prompt + sign-in link |
| agent | `200`, tenant-scoped to their `agencyId` | named greeting + sign-out |

Witnesses: existing `agency-admin-rbac.test.ts` (L2 pinned ladder),
`tests/e2e/smoke.spec.ts` + `trust-boundary.spec.ts` (live negatives), new
`tests/e2e/sign-in.spec.ts` (live positives).
