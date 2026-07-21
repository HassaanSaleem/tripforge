# Contract: `/view` traveler home route

No tRPC contract changes. This documents the **page** contract for `/view`.

## Route: `GET /view` (route-group `(client-view)` index, `force-dynamic`)

Reads the session via `getSessionContext(headers)` and branches:

### Anonymous (no session)
- Renders a brand-neutral welcome (`<div data-plain className="tf-client-root">`).
- Heading text contains `Your trip…` (preserves the pinned INV-020/024 e2e negatives on `/view`).
- Offers **Sign in** (`/view/sign-in`) and **Create an account** (`/view/sign-up`) actions.
- Computes/fetches **no** trip data. No `clientView.*` call is made.
- MUST NOT contain `TripForge`/`Trellis` (body or `<title>`), nor an "Agency workspace" link, nor
  an "agency membership" prompt.

### Signed in (session present)
- Renders the personalized home (`<div data-plain className="tf-client-root">`).
- Reads ONLY `clientView.me` (name/email; `null` ⇒ generic greeting) and `clientView.myTrips`
  (count + link) through the session-aware in-process caller (`getAuthenticatedCaller(headers)`).
- Surfaces:
  - **My Trips** → link `/view/my-trips` (with count when > 0).
  - **Plan a trip** → coming soon (non-interactive).
  - **Discover what's hot** → coming soon (non-interactive).
  - **Sign out** → ends session, returns to `/view` (anonymous welcome).
- MUST be brand-neutral (INV-020) and carry no workspace affordance (INV-024).

## Procedures consumed (all pre-existing, unchanged)

| Procedure | Kind | Notes |
|---|---|---|
| `clientView.me` | `protectedProcedure` query | signed-in caller's own name/email; UNAUTHORIZED if anonymous (the home only calls it in the signed-in branch) |
| `clientView.myTrips` | `protectedProcedure` query | caller's own linked trips, keyed on `ctx.session.userId` (FR-005 of spec 031); no cross-visitor read |

**No `workspace.*` procedure is reachable or called** from this route. INV-023 (traveler → workspace
= FORBIDDEN) is unchanged; no new server capability is added.
