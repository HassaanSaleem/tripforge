# Implementation Plan: Consumer-surface navigation side panel (signed-in traveler)

**Branch**: `kitchen/fix-goal-client-side-panel-nav` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/037-consumer-nav-side-panel/spec.md`

## Summary

Add a persistent, brand-neutral navigation panel to the signed-in traveler
consumer surface (`/view` home, `/view/my-trips`) so a traveler can move between
the available sections (Home, My Trips) and see honest coming-soon signposts for
the not-yet-built ones (Plan a trip, Discover / What's Hot, Group trips), with
sign-out in an Account area. It reuses the existing responsive `.tf-app-shell` /
`.tf-sidebar` theme kit and mirrors the agent-side shell pattern (a single nav
source of truth → a stateless server-rendered sidebar → a page-shell wrapper) but
as a **distinct consumer module** (INV-024: navigation separated by user type).
The anonymous `/view` welcome and the `/view/[token]` white-label proposal view are
byte-unchanged (INV-020 / INV-018). No server, schema, or money-path change.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 15 App Router, React 19), pnpm workspace

**Primary Dependencies**: Next.js `Link`, existing `.tf-*` CSS in
`apps/web/app/globals.css`, existing `TravelerSignOut` client control, existing
`getSessionContext` / `getAuthenticatedCaller` (`clientView.me` / `clientView.myTrips`)

**Storage**: N/A — no DB read/write added (session-scoped reads already used by the pages)

**Testing**: Vitest (L1/L2) + Playwright e2e (L4, against the built compose image, INV-027)

**Target Platform**: Web (desktop + mobile viewport), single Next.js app in `apps/web`

**Project Type**: Web application (existing turborepo; only `apps/web` changes)

**Performance Goals**: No new network calls; server-rendered panel; CSS-only responsive collapse

**Constraints**: INV-020 (no platform brand on client-facing output),
INV-018 (anonymous share-token view unchanged), INV-023/INV-024 (traveler can't
reach workspace; surfaces separated by user type, not flags). No `"use client"`
boundary for the nav itself.

**Scale/Scope**: 2 signed-in pages wrapped today; ~6 nav destinations; ~3 new
`apps/web` files + edits to 2 pages + CSS additions; 1 new e2e spec.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Verdict |
|-----------|------------|---------|
| **I. Marketplace-First** | The panel surfaces the consumer sections that funnel demand into the agent network (My Trips = agency-owned shared trips; Plan / Discover / Group are all marketplace-fed features being built this campaign). It adds no standalone-planner capability; it is pure wayfinding toward marketplace-connected surfaces. | PASS |
| **II. Agent Experience / white-label** | The panel is the traveler's OWN-surface chrome only. The white-label proposal view (`/view/[token]`) and anonymous `/view` stay brand-neutral and nav-free — the pinned INV-020 negatives are preserved, not weakened. | PASS |
| **III. Budget-Aware AI** | N/A — no planner output; no static-suggestion-as-planner-output introduced. | PASS (N/A) |
| **IV. Canonical Itinerary Schema** | Untouched. The "Consumer Nav Destination" entity is a UI data structure, not part of the itinerary schema. No versioned migration needed. | PASS |
| **V. Integrate Supply** | Untouched — no supplier/adapter code. | PASS (N/A) |
| **VI. Trust / Provenance / Revenue-Share** | No money path, no revenue-share, no client-ownership change. INV-023/INV-024 preserved: the consumer nav is a distinct module from the agent nav (separated by user type), exposes no workspace affordance, and reaches no workspace procedure. | PASS |
| **Non-Goals** | Does not drift into a generic consumer planner — it is navigation to marketplace-fed sections; unbuilt sections are coming-soon signposts, not new capabilities. | PASS |
| **MVP Scope Discipline** | This is P2 consumer-surface work. It is explicitly operator-authorized in `GOAL.md` (2026-07-21 scope pull-forward + 2026-07-22 operator-flagged gap), satisfying the constitution's "explicit operator scope decision" requirement for P1+ items. | PASS |

**Money-path / schema gates**: none triggered — no canonical-schema change (no
migration note required), no supplier API shapes, no money path (no L3
conservation test required). ALWAYS-HALT list (DIRECTIVE §2): none triggered — no
constitution amendment, no schema bump, no revenue-share/client-ownership change,
no gate change.

**Re-check after Phase 1 design**: still PASS — the design adds only UI files
(`lib/client-nav.ts`, a consumer sidebar, a consumer page-shell) and CSS; it reuses
the existing session read; it touches no server, schema, adapter, or money code.

**One decision surfaced (non-blocking, D-037.a in spec.md)**: the ticket's
"TripForge-branded" language vs the pinned INV-020 no-platform-brand negatives on
the traveler surface. Resolution: hold the invariant, ship brand-neutral, and file
the wordmark question for the operator rather than self-deciding a scoping change
to an invariant. No pinned assertion is weakened.

## Project Structure

### Documentation (this feature)

```text
specs/037-consumer-nav-side-panel/
├── plan.md              # This file
├── research.md          # Phase 0 — pattern reuse + INV analysis + decisions
├── data-model.md        # Phase 1 — Consumer Nav Destination (UI data)
├── quickstart.md        # Phase 1 — how to verify locally / in browser
├── contracts/
│   └── README.md        # Phase 1 — explicit "no new API contract" note
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/web/
├── lib/
│   └── client-nav.ts                         # NEW — consumer nav source of truth (pure data, L1-testable)
├── app/(client-view)/view/
│   ├── components/
│   │   ├── client-nav-sidebar.tsx            # NEW — stateless server-rendered consumer sidebar (+ local icons)
│   │   └── client-surface-shell.tsx          # NEW — consumer page shell (sidebar + main), brand-neutral
│   ├── page.tsx                              # EDIT — wrap the SIGNED-IN home branch in the shell (anonymous branch untouched)
│   ├── traveler-home.tsx                     # (unchanged — TravelerSignOut reused by the shell)
│   └── my-trips/page.tsx                     # EDIT — wrap the signed-in content in the shell
├── app/globals.css                           # EDIT — additive .tf-client-shell / coming-soon / account styles (reuse .tf-app-shell/.tf-sidebar)
└── (client-view)/view/[token]/page.tsx       # UNTOUCHED — anonymous white-label proposal view

apps/web/lib/__tests__/
└── client-nav.test.ts                        # NEW — L1: destination invariants (ids exhaustive, hrefs only when live, order)

tests/e2e/
└── consumer-nav-journey.spec.ts              # NEW — L4: signed-in nav works + anonymous /view & /view/[token] unchanged (INV-020/024)
```

**Structure Decision**: Web application, `apps/web` only. The consumer nav is a
new module family under the existing `(client-view)` route group, deliberately
separate from the agent `lib/nav.ts` / `(workspace)/components/*` family per
INV-024 ("route groups and navigation are separated by user type, not toggled by
flags"). It reuses the shared `.tf-*` theme CSS (the theme kit) rather than
forking styles.

## Complexity Tracking

> No Constitution Check violations — this section intentionally empty.
