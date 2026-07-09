# Research: Agent Sign-In / Session-Establishment UI

**Feature**: specs/007-agent-sign-in | **Date**: 2026-07-09

No NEEDS CLARIFICATION markers remained in the Technical Context; the decisions
below resolve the design unknowns called out in the ticket and spec.

## D1 — How the agency context becomes active on the session

**Decision**: Better Auth `databaseHooks.session.create.before` in
`apps/web/lib/auth.ts`: when a session row is created, look up the user's
primary agency membership (`getPrimaryMembership(db, userId)`, oldest
membership first) and persist its `organizationId` as
`session.activeOrganizationId`. Users without a membership get a session with
no active organization (traveler), exactly as today.

**Rationale**: Server-side and client-agnostic — every session-creation path
(sign-in UI, e2e journeys, future mobile app, scripts hitting the HTTP API)
gets agent context without remembering to call anything. Serverless-correct
(INV-028): the result persists on the session row in Postgres; no in-process
state. Cost is one indexed query per session *creation*, not per request.
`getSessionContext` (which reads `activeOrganizationId` and re-verifies the
membership role per request) is unchanged, so the INV-023 ladder and its
pinned tests are untouched.

**Alternatives considered**:
- *Client-side `organization.setActive` after each sign-in*: rejected — every
  client must remember it; a missed call silently degrades an agent to
  traveler (exactly the class of bug the iteration-2 live journey hit).
- *Per-request fallback in `getSessionContext` (query membership when
  `activeOrganizationId` is null)*: rejected — adds a query to every request
  forever, and makes the session's persisted state lie about what the request
  actually resolved.

## D2 — Self-serve sign-up creates account + agency

**Decision**: Client flow on `/sign-up`: `authClient.signUp.email({name,
email, password})` → `authClient.organization.create({name, slug})` →
`authClient.organization.setActive({organizationId})` → navigate to
`/workspace`. Slug is generated from the agency name (lowercased, hyphenated)
plus a short random suffix to guarantee uniqueness.

**Rationale**: The Better Auth organization plugin already makes the creator
an `owner` member — this is precisely the ratified P0 onboarding path
(iteration-2 IMP-1: self-serve agency creation, no email verification). The
explicit `setActive` covers the ordering gap: the sign-up session is created
*before* the organization exists, so the D1 hook cannot have activated it.

**Alternatives considered**:
- *Server action wrapping all three steps*: rejected for P0 — three sequential
  client calls against the existing catch-all endpoints are simpler, and the
  Better Auth client handles session cookies natively.
- *Auto-create an agency inside the D1 hook for org-less users*: rejected —
  agenthood must be an explicit user action, not a side effect of getting a
  session (a traveler session is a legitimate state, INV-023/024).

## D3 — Browser auth client

**Decision**: New `apps/web/lib/auth-client.ts` exporting `authClient =
createAuthClient({plugins: [organizationClient()]})` from `better-auth/react`
and `better-auth/client/plugins`.

**Rationale**: `better-auth` is already an `apps/web` dependency — the client
entry points ship in the same package, so **no new dependency** is added. Same-
origin default baseURL matches the mounted catch-all handler.

**Alternatives considered**: hand-rolled `fetch` against `/api/auth/*` —
rejected: re-implements cookie/CSRF handling the client already does.

## D4 — Route placement (INV-024)

**Decision**: `/sign-in` and `/sign-up` live in the `(workspace)` route group
(`apps/web/app/(workspace)/sign-in`, `.../sign-up`) — the platform-branded
side. The `(client-view)` group is untouched.

**Rationale**: Session establishment is agent/platform chrome. Route groups
are the repo's INV-024 mechanism (seed-0011 precedent: per-group metadata);
placing the pages in `(workspace)` keeps platform branding inheritance correct
and keeps the white-labeled `/view` free of sign-in chrome (INV-020 negative
e2e stays green).

## D5 — Human names on the workspace greeting (IMP-2)

**Decision**: The workspace page (server component) reads the Better Auth
session (`user.name` is already on it) and resolves the agency name via a new
read-only helper `getOrganizationName(db, organizationId)` in
`packages/db/src/membership.ts`. Greeting shows `name · agency name · role`;
raw `userId`/`agencyId` are removed from the rendered page.

**Rationale**: `membership.ts` exists exactly to keep ORM predicates inside
`packages/db` ("the app layer never builds ORM predicates itself"); a
one-select name lookup follows that pattern. The alternative —
`auth.api.getFullOrganization` — also returns the full member list (heavier)
and couples the greeting to a larger plugin surface.

## D6 — Sign-out

**Decision**: A small client component (`sign-out-button.tsx`) rendered on the
workspace page for signed-in users; calls `authClient.signOut()` then
navigates to `/sign-in` (router refresh so server components re-read the
session).

## D7 — Already-signed-in visitor on /sign-in

**Decision**: The `/sign-in` and `/sign-up` pages are server components that
`redirect("/workspace")` when the visitor already has an *agent* session
(active agency). Travelers and anonymous visitors see the forms.

**Rationale**: Satisfies the spec edge case (no broken loop) with zero client
logic; travelers may legitimately need the form to switch accounts.

## D8 — Credential failure UX (FR-004)

**Decision**: The sign-in form maps any Better Auth error to the single
human-readable message "Invalid email or password." rendered inline; the
sign-up form surfaces Better Auth's message for duplicate email ("account
already exists" class) verbatim. No status codes, no stack traces, no session
on failure.

## D9 — Test strategy

**Decision**:
- **L3 (env-gated, real Postgres)**: `packages/db/src/__tests__/membership.test.ts`
  covers `getPrimaryMembership` (no membership → undefined; one membership →
  that org; two memberships → oldest wins) and `getOrganizationName`. Runs when
  `DATABASE_URL` is set (same gating pattern as the existing L3 suites).
- **e2e (built compose image, INV-027)**: `tests/e2e/sign-in.spec.ts` — one
  journey: self-serve sign-up (unique email per run) → workspace greeting shows
  name/agency/role and NOT raw IDs → sign out → sign in again → workspace →
  wrong-password negative (stays on page, sees error, no session). The D1 hook
  is exercised end-to-end by the sign-in leg (fresh session, membership
  auto-activated).
- **Existing negatives stay green untouched**: anonymous workspace membership
  prompt (smoke.spec), INV-020/024 trust-boundary specs, agency-admin RBAC
  caller tests (INV-023 ladder unchanged).

**Rationale**: The changed behavior is session establishment + greeting —
both live at the HTTP/browser boundary, so the e2e journey is the primary
witness; the db helpers are the only new pure-code units and get direct L3
coverage. No money paths → no conservation obligations.
