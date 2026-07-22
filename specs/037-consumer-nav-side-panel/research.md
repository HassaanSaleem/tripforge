# Phase 0 Research: Consumer-surface navigation side panel

## R1 — Reuse the agent shell pattern, but as a distinct consumer module

The authenticated agent surface already solves "persistent nav + responsive
collapse" (spec 017):

- `apps/web/lib/nav.ts` — a pure-data single source of truth (`NAV_DESTINATIONS`,
  `NavDestinationId` union) consumed by both the renderer and each page's
  `activeNav`.
- `apps/web/app/(workspace)/components/app-sidebar.tsx` — a **stateless** sidebar:
  a checkbox-driven CSS collapse (`#tf-sidebar-toggle`), no `"use client"`, local
  inline SVG icons (no icon library, research D8).
- `apps/web/app/(workspace)/components/workspace-page-shell.tsx` — wraps sidebar +
  header + `<main>`.

**Decision**: mirror this three-part shape for the consumer surface —
`lib/client-nav.ts` → `client-nav-sidebar.tsx` → `client-surface-shell.tsx` — but
as a **new module family**, not a reuse of the agent components.

**Why not reuse `AppSidebar` / `WorkspacePageShell` directly**: they render the
"TripForge" wordmark, the agency identity header, a role badge, and an
agency-membership guard — all of which are forbidden on the traveler surface
(INV-020 negatives + INV-024). INV-024 is explicit: "route groups and navigation
are separated by user type, **not toggled by flags**." A shared component behind a
`surface` flag would violate that letter. The **CSS** (`.tf-app-shell`,
`.tf-sidebar`, the `@media (max-width: 880px)` collapse) IS shared — that is the
theme kit, and reusing it is the intended path (avoids a forked responsive
implementation).

**Pre-Write decisions (clean-architecture SKILL.md):**

| Artifact | Decision | Justification |
|----------|----------|---------------|
| `lib/client-nav.ts` | **new** | Distinct vocabulary from agent `NAV_DESTINATIONS` (Home/My Trips/Plan/Discover/Group vs Dashboard/AI Builder/Marketplace/Trip Requests — none traveler-reachable) and it needs a `status: live \| soon` concept the agent nav has no notion of. INV-024 mandates separation by user type. |
| `client-nav-sidebar.tsx` | **new** | Traveler sidebar is brand-neutral, has coming-soon (non-link) items, and an Account/sign-out area — none present in `AppSidebar`. |
| `client-surface-shell.tsx` | **new** | `WorkspacePageShell` renders agency identity + "TripForge" wordmark + membership guard, all forbidden here. |
| `.tf-app-shell` / `.tf-sidebar` CSS | **reuse** | The responsive collapse + layout already exist and are theme-kit-level; reusing avoids a forked implementation. Add only additive `.tf-client-shell` / coming-soon / account styles. |
| `TravelerSignOut` (`traveler-home.tsx`) | **reuse** | Already the traveler-scoped sign-out (Better Auth `signOut()` → `/view`), carries the pinned `home-sign-out` testid. Reused verbatim inside the shell's Account area. |
| Inline SVG icons | **new (local, small)** | The consumer nav needs a "home" and an "account/user" icon absent from the agent set; keeping a tiny local icon renderer avoids touching the agent sidebar (blast-radius). Not extracted to a shared module (only 1 consumer callsite today; below the 2+ extraction threshold). |

## R2 — Where does the shell attach? (not a route-group layout)

The `(client-view)` route group contains, as siblings under `/view`: the
signed-in/anonymous `page.tsx`, the anonymous `[token]/page.tsx`, `my-trips`,
`sign-in`, `sign-up`. A layout at `(client-view)` or `/view` would wrap the
anonymous token view and auth screens too — leaking the panel onto brand-neutral
surfaces.

**Decision**: attach the shell **per signed-in render branch**, exactly where the
existing pages already branch on session:
- `view/page.tsx` — wrap ONLY the `TravelerHome` (session present) branch; leave
  `AnonymousWelcome` untouched.
- `view/my-trips/page.tsx` — wrap the post-redirect (session present) content.

The anonymous `/view`, `/view/[token]`, and the `my-trips` unauthenticated
redirect are never wrapped. This is the smallest change that guarantees FR-005.

## R3 — INV-020 pins the brand-neutral treatment (decisive constraint)

Two e2e specs HARD-PIN that "TripForge"/"Trellis" appear NOWHERE on the signed-in
`/view`:
- `tests/e2e/trust-boundary.spec.ts:19-25` — on `/view`: `getByText(/TripForge/i)`
  and `/Trellis/i` count 0; `not.toHaveTitle(/TripForge|Trellis/i)`.
- `tests/e2e/traveler-home-journey.spec.ts:51-53` — same negatives on the SIGNED-IN
  home.

Loop rule: never weaken a test assertion. **Decision**: the consumer sidebar uses a
**brand-neutral wordmark** (e.g. an account/section label with the neutral diamond
mark that `[data-plain] .tf-brand::before` already suppresses) — never "TripForge"
/ "Trellis". The whole shell is wrapped in `data-plain` so the existing
brand-neutral CSS treatment applies. The ticket's "TripForge-branded" is
interpreted as "the platform's premium-themed product surface" and the wordmark
question is surfaced as D-037.a for the operator, not self-decided.

## R4 — Playwright accessible-name substring collision (avoid regressions)

`lib/nav.ts` documents that Playwright's `getByRole("link", { name })` matches by
**substring** — the agent nav deliberately uses "Group Travel" / "Trip Requests"
(not "…Trips") so `name: "Trips"` resolves to exactly one link. Existing agent
specs scope with `getByRole("navigation", { name: "Main navigation" })`.

**Decisions**:
- Label the consumer nav landmark distinctly: `aria-label="Traveler navigation"`
  (not "Main navigation") — no cross-surface selector collision.
- In the consumer nav, "My Trips" is the only link containing "Trips"; "Group
  trips" is a coming-soon **non-link** (`<span>`), so no link-role collision exists.
- The new e2e spec selects by `data-testid` / exact names, never a bare
  `name: "Trips"`.

## R5 — Viewport / actionability

`playwright.config.ts` runs `Desktop Chrome` (1280×720). At that width the sidebar
is a visible 248px column, so `getByTestId("home-sign-out")` in the sidebar stays
click-actionable and `traveler-home-journey.spec.ts:63` stays green. The mobile
off-canvas collapse (`@media (max-width: 880px)`, `left:-260px`, checkbox toggle)
is verified live in the browser at ~390px during the INV-027 gate (no e2e viewport
change needed).

## R6 — Session reads (no new capability)

- `view/page.tsx` already calls `clientView.me()` + `clientView.myTrips()` on the
  signed-in branch → pass the traveler name to the shell for the Account area.
- `view/my-trips/page.tsx` calls only `clientView.myTrips()` today; add a parallel
  `clientView.me()` read (session-scoped, existing procedure) so the Account area can
  greet by name there too. No new procedure, no new authz surface (INV-023 intact:
  `clientView.*` is the traveler router; workspace procedures remain unreachable).

## Alternatives considered

- **Shared agent/consumer shell behind a flag** — rejected (INV-024 forbids
  flag-toggled surface separation; also drags agency-identity/brand chrome).
- **Route-group layout** — rejected (would wrap the anonymous token view + auth
  screens; FR-005 violation).
- **Client-side nav component (`"use client"`)** — unnecessary; the agent pattern
  proves a stateless server-rendered checkbox-CSS collapse suffices.
