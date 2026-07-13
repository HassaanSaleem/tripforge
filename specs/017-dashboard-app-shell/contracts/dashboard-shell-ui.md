# UI Contract: Dashboard App Shell (spec 017)

Fixes (a) the one new server procedure this feature adds and how it may be
called, (b) the route map and shell contract every authenticated page must
honor, and (c) the user-observable behavior the e2e suite asserts.

## §1 New procedure

| Procedure | Call site | When | Notes |
|-----------|-----------|------|-------|
| `workspace.dashboard.stats` (query) | `dashboard-home.tsx` | Dashboard page mount | Agent-gated (`agentProcedure`, INV-023); tenant-scoped at the query (INV-004); returns the shape in `data-model.md`; zero-safe (never errors for a fresh agency). |

Forbidden: any client-side summation of `gbvByCurrency`/`earningsByCurrency`
entries across currencies; any other new procedure; any client-side money
arithmetic on the returned minor-unit values (display via existing
formatters only).

## §2 Route map (authenticated surface)

| Route | `activeNav` | Renders | Status |
|-------|-------------|---------|--------|
| `/dashboard` | `"dashboard"` | `DashboardHome` (stat tiles, recent activity, quick actions) | NEW — new post-sign-in default |
| `/workspace` | `"builder"` | `Planner` only | MODIFIED — no longer also hosts trips/media |
| `/trips` | `"trips"` | `ItineraryList` | NEW |
| `/media` | `"media"` | `MediaLibraryPanel` | NEW |
| `/marketplace` | `"marketplace"` | `MarketplacePanel` | UNCHANGED |
| `/discover` | `"discover"` | static placeholder | NEW |

Every route above composes `WorkspacePageShell` with its own `activeNav`
value; the shell renders the sidebar with that value's item marked active.
Non-agents/anonymous visitors see the shell's existing membership-guard
branch on every one of these routes (unchanged behavior, no sidebar).

## §3 Shell contract

| Element | Behavior |
|---------|----------|
| Top header | Brand mark, agent identity, agency name, role badge, sign-out — unchanged markup/behavior from before this feature. |
| Sidebar | Always rendered for a verified agent, on every route in §2; exactly the six items in §2's table; the item matching the current route's `activeNav` is visually marked active (`aria-current="page"`, consistent with the prior top-nav convention). |
| Sidebar collapse | On narrow viewports the sidebar is collapsed by default and reachable via a toggle control; every item stays navigable once expanded (D4 — CSS-only, no JS state). |
| Content area | Not width-capped at 940px for these six routes; the global `main` width rule is overridden only inside `.tf-app-shell` (D9) — landing page and auth screens are unaffected. |

## §4 Dashboard home states

| State | Trigger | Observable behavior |
|-------|---------|---------------------|
| loading | mount | Shell renders (sidebar + header) immediately; stat area shows a pending state, never a blank pane. |
| loaded, zero-activity | `dashboard.stats` resolves with all-zero/empty fields | Every stat tile shows a correct zero value (not hidden, not omitted); recent-activity area shows a friendly empty state; quick-action cards are still present and usable. |
| loaded, populated | `dashboard.stats` resolves with data | Stat tiles show the agency's own values per currency; recent-activity list shows up to the fixed cap, newest first; quick-action cards present. |
| failed | query rejects | Stat/activity area shows a clear failure message (existing transport-error wording pattern); sidebar and header remain usable — a stats failure never takes down navigation. |

## §5 Access

- The dashboard and every split-out destination render only inside
  `WorkspacePageShell`'s verified-agent branch (INV-024 UX gate);
  authorization for the underlying data stays per-procedure (INV-023).
- No change to anonymous/traveler behavior on any of these routes (existing
  membership prompt, no sidebar, no stats fetch).

## §6 Test obligations

| Level | File | Asserts |
|-------|------|---------|
| L1 | `apps/web/lib/__tests__/nav.test.ts` | The six nav destinations map 1:1 to `WorkspacePageShell`'s `activeNav` union; href/label pairs are stable. |
| L3 | `packages/api/src/__tests__/l3-dashboard-stats.test.ts` (NEW) | Two-tenant isolation (agency A's stats never include agency B's rows); zero-state agency returns all-zero/empty, not an error; a booking in currency X and one in currency Y never collapse into one summed number. |
| L4 | `tests/e2e/dashboard-shell-journey.spec.ts` (NEW) | Sign-in lands on `/dashboard`; all six sidebar items navigate to their routes with the correct one marked active; a fresh agency sees a zero-state dashboard; after drafting/booking/listing/licensing live, the dashboard reflects it. |
| L4 (updated) | `planner-journey.spec.ts`, `workspace-list-journey.spec.ts`, `content-library-journey.spec.ts`, `sign-in.spec.ts` | Navigation targets updated to the new routes (`/trips`, `/media`) and the new post-sign-in landing (`/dashboard`); no existing assertion is weakened. |

No existing assertion may be weakened or retitled.
