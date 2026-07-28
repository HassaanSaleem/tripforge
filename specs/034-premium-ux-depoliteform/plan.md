# Implementation Plan: Premium UX — kill the "Google Form" look

**Branch**: `kitchen/fix-goal-ui-depoliteform-premium-ux` | **Spec**: `./spec.md`
**Ticket**: `goal-ui-depoliteform` (GOAL.md Deliverable 5)

## Summary

Lift the shared `.tf-*` theme kit and three named surfaces (planner, auth,
booking review) from a "Google Form" (bare uppercase-label + input stacks) to a
premium travel product. The change is **presentation-only**: it extends
`apps/web/app/globals.css` in place and adds contract-safe wrapper markup to the
affected components. No accessible name, ARIA role, testid, class-selector hook,
money-math, canonical schema, or supply-adapter surface changes.

## Technical Context

- **Language/stack**: Next.js (App Router) + React + TypeScript; a single global
  stylesheet (`apps/web/app/globals.css`) drives the theme at the element level
  plus `.tf-*` component classes. No CSS-in-JS, no design-system package.
- **Primary lever**: `globals.css` — cascades to every surface, so most of the
  premium lift is CSS-only with zero markup risk.
- **Contract surface to preserve** (harvested from the e2e suite):
  - `getByLabel` exact names: `Email`, `Password`, `Your name`, `Agency name`,
    `Destination`, `Check-in`, `Check-out`, `Adults`, `Children`,
    `Budget` (exact — distinct from `Budget mode`), `Currency`, `Markup %`.
  - Segmented controls: `role=radiogroup` named `Trip style` / `Budget mode`
    with `role=radio` options and `aria-checked`.
  - Testids: planner (`compare-options`, `draft-result`, `budget-fit`,
    `destination-picker`, …), booking (`booking-flow`, `quote-review`,
    `booking-confirmation`), auth uses labels not testids.
  - Direct class selectors asserted by client-view journey: `.tf-client-items`,
    `.tf-client-total`, `.tf-client-booked`, `.tf-price-note`.
  - Home smoke: `/` heading "TripForge" + `/Agency workspace/i` link; `/view`
    white-label negatives (no "TripForge"/"Trellis").
- **Imagery**: first-party staged shots in `apps/web/public/shots/` for the
  agent auth panel; CSS gradients elsewhere. No fabricated place imagery.

## Constitution Check

Evaluated against `.specify/memory/constitution.md` v1.1.0 (Principles I–VI +
Non-Goals + Compliance). **PASS.**

- **I. Marketplace-First** — Neutral. Presentation polish on existing surfaces;
  funnels no demand away from the marketplace; introduces no consumer-planner
  non-goal surface.
- **II. Agent Experience Is the Wedge** — **Directly advances.** Principle II
  makes polish first-class ("match or beat leading tools on speed and polish").
  This is that lift. White-label posture preserved: client surfaces stay
  brand-neutral (FR-004), agent brand never leaks onto `[data-plain]`.
- **III. Budget-Aware AI** — Neutral. No planner logic, allocation, or
  live-pricing change; the budget-fit breakdown remains. No fabricated imagery
  (uses first-party product shots + gradients only).
- **IV. Canonical Itinerary Schema** — Neutral. No schema touch. Presentation
  only. No migration note required.
- **V. Integrate Supply, Don't Contract It** — Neutral. No supplier/adapter
  code; booking review is display-only over the existing quote data.
- **VI. Trust, Provenance & Revenue-Share Integrity** — Neutral. No money path
  changes; net rate / markup / client price columns and semantics are preserved
  exactly, only restyled. No new money path → no new L3 money test required
  (existing money-path L3s must stay green — they are the regression guard).
- **Non-Goals** — None triggered (no ride-hailing, no flights MoR, no Airbnb, no
  generic consumer planner). This is polish on existing P0/authorized-P2 scope.
- **Compliance & Content Sourcing** — Honored: real/first-party imagery only,
  never AI-fabricated place photos; no third-party image re-hosting.
- **MVP Scope Discipline** — In scope: GOAL.md D5 is operator-authorized this
  campaign. Simplicity default honored (progressive sectioning, not a
  speculative wizard framework).

**No violations → Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```
specs/034-premium-ux-depoliteform/
├── spec.md
├── plan.md      # this file
└── tasks.md
```

### Source Code (files touched)

```
apps/web/app/globals.css                                   # shared kit lift (primary)
apps/web/app/(workspace)/workspace/planner.tsx             # guided sectioning
apps/web/app/(workspace)/sign-in/page.tsx                  # agent auth split
apps/web/app/(workspace)/sign-up/page.tsx                  # agent auth split
apps/web/app/(workspace)/components/auth-brand-panel.tsx   # NEW shared story/visual panel (agent)
apps/web/app/(client-view)/view/client-auth-shell.tsx      # client auth premium (neutral)
apps/web/app/(workspace)/workspace/booking-flow.tsx        # quote-review summary polish
apps/web/lib/auth-form.tsx                                  # field hint helper (optional, shared)
```

## Phasing

- **Phase 0 — Research**: none required; the surfaces and contracts are fully
  mapped (see Technical Context). Constitution Check passed pre-design.
- **Phase 1 — Design/Implement**: extend `globals.css`; add the shared agent
  auth brand panel; wire the four surfaces. Re-run Constitution Check after
  design → still PASS (no new entities, no schema/money/adapter surface).
- **Phase 2 — Verify**: lint, unit/integration tests, full e2e, L3 live smoke,
  Playwright MCP QA journey with before/after screenshots, compose-log scan.

## Complexity Tracking

None — Constitution Check passed with no violations.
