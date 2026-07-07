# Scenario: agent-onboarding-live (Kitchen Loop iteration 2, T1)

A brand-new agent onboards against the **live** stack — sign-up → agency
(organization) creation → active org → agent-gated `workspace.whoami` →
`/workspace` greeting — plus the anonymous negatives and the client-view
INV-020 brand boundary. Two agents onboard to prove tenant isolation (INV-004).

There is no sign-in UI yet (seed-0008), so the Better Auth HTTP API is the only
session-establishment path a user has; the script emulates a browser (Origin
header, cookie jar).

## Run

```bash
docker compose up --build --wait
BASE_URL=http://localhost:3000 node scenarios/incubating/agent-onboarding-live/scenario.mjs
```

Exit 0 = the full journey passes. L3-style: real server, real Postgres rows,
state-delta assertions (the same gated procedure flips from FORBIDDEN to
identity-with-agencyId after org creation).

## Known-failing assertion (intentional — pins an open bug)

`client view leaks NO platform branding (INV-020)` FAILS as of 2026-07-07:
the root `apps/web/app/layout.tsx` metadata sets `title: "TripForge"` globally,
so the traveler's browser tab shows the platform brand on `/view`. The
assertion stays red until the product is fixed (see the iteration-2 experience
report, BUG-2). Do not weaken it.
