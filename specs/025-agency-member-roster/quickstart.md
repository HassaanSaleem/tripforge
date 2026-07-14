# Quickstart: Validate Agency Member Roster

## Prerequisites

- Repo built and dependencies installed (pnpm workspace).
- A running Postgres reachable via `DATABASE_URL` (the L3 suite and the
  live compose stack both need this — see `kitchenloop.yaml`'s
  `verification.live.boot_command`).

## Automated validation

```bash
# Unit/RBAC-ladder (no DB needed) — anon UNAUTHORIZED, traveler/member FORBIDDEN
pnpm --filter @tripforge/api test -- agency-admin-router-rbac

# Real-Postgres L3 — owner/admin ALLOWED + INV-004 tenant isolation
DATABASE_URL=<compose-postgres-url> pnpm --filter @tripforge/api test -- l3-agency-admin

# Full suite (also picks up both new files)
pnpm test
```

Expected: all new tests pass; every pre-existing test still passes
(no router/context signature changed, only additive).

## Manual / live validation (in-process caller — no UI exists yet)

1. Boot the built compose stack:
   `docker compose down -v && docker compose up --build --wait`
2. Sign up two agencies via `/sign-up` (each becomes the founding owner of
   their own agency).
3. From a server context (or a throwaway script using
   `createAppCaller`/`appRouter.createCaller`), call
   `workspace.agencyAdmin.members()` as each owner's session and confirm:
   - Each owner sees exactly their own agency's member(s).
   - Neither sees the other agency's member.
4. Confirm a plain HTTP call with no session (or an unauthenticated
   `fetch` to the tRPC endpoint) is rejected.

There is no UI page for this feature (per spec Assumptions) — the
Live Test & Fix protocol for this ticket therefore verifies the API
contract directly (in-process caller / tRPC HTTP call) rather than a
browser journey, and the PR's Live Test Evidence section records this
explicitly.

## Success signal

- `pnpm test` green, including the two new files.
- `l3-agency-admin.test.ts`'s three `it` blocks all pass against the
  compose Postgres.
- No existing test's behavior changed (workspace router gained a field,
  nothing removed or renamed).
