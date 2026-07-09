# Quickstart: validating Agent Sign-In / Session Establishment

**Feature**: specs/007-agent-sign-in | **Date**: 2026-07-09

## Prerequisites

- Docker daemon running; repo checked out at this feature's branch.
- No API keys required (INV-019 — the stack is fully functional keyless).

## 1. Boot the built stack (INV-027 — built image, not a dev server)

```bash
docker compose down -v && docker compose up --build --wait
```

Expect exit 0 with postgres, mailpit, migrate (exited-ok), web healthy.

## 2. Deterministic suites

```bash
pnpm test            # vitest L1/L2 (+ env-gated L3 with DATABASE_URL set)
pnpm run lint        # eslint
node tests/integration/smoke.mjs   # L3 smoke against the running stack
npx playwright test  # e2e incl. tests/e2e/sign-in.spec.ts (the primary witness)
```

In loop sessions where host pnpm is denied (desk row ENV-PNPM-DENY), run the
vitest/eslint gates inside the built image per the documented recipe
(`docker build -f apps/web/Dockerfile --target build …` then
`docker run --rm --network tripforge_default -e DATABASE_URL=… pnpm test`).

## 3. Manual browser validation (what the e2e automates)

1. Open `http://localhost:3000/sign-up` → fill name "Ada Tour", email
   `ada+<unique>@example.test`, a password (≥ 8 chars), agency name
   "Ada Tours" → submit.
   **Expect**: arrival at `/workspace`; greeting shows **Ada Tour**,
   **Ada Tours**, role **owner** — and no raw IDs anywhere on the page.
2. Click **Sign out**.
   **Expect**: back on `/sign-in`; visiting `/workspace` now shows the
   membership prompt (with a sign-in link), not the greeting.
3. On `/sign-in`, enter the same email with a **wrong** password.
   **Expect**: stay on `/sign-in` with "Invalid email or password."; no session.
4. Enter the correct password.
   **Expect**: `/workspace` greeting again (this leg proves the session-create
   hook activates the agency without any manual step).
5. Open `http://localhost:3000/view`.
   **Expect**: white-labeled client view with **no** sign-in chrome and no
   platform branding (INV-020).

## 4. Log scan

```bash
docker compose logs --no-color > compose.log
grep -E "ERROR|FATAL|Unhandled" compose.log   # expect no non-allowlisted hits
```

## 5. Teardown

```bash
docker compose down -v
```
