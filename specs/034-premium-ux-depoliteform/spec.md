# Feature Specification: Premium UX — kill the "Google Form" look

**Feature Branch**: `kitchen/fix-goal-ui-depoliteform-premium-ux`

**Created**: 2026-07-22

**Status**: Draft

**Input**: Ticket `goal-ui-depoliteform` (GOAL.md Deliverable 5). "The product
reads like a Google Form (stacked labels + inputs, no craft). Lift the shared UI
to a premium travel product on both surfaces: real form components with
considered spacing/typography, guided flows instead of one long undifferentiated
form, real imagery, and a plan→book flow that feels guided rather than
filled-in. Extend the existing seed-0009s `.tf-*` theme kit in
`apps/web/app/globals.css`; do not fork per-page styles."

## Clarifications

Resolved autonomously (no interactive operator; assumptions recorded here and in
the PR):

- **"Guided multi-step flows instead of one long form"** is delivered as
  **progressive visual sectioning** of the planner form (grouped, titled
  sections with hints and a guided plan→book rail), NOT a step-wizard that hides
  fields. A wizard that unmounts/hides inputs would break the e2e contract
  (Playwright fills every field by accessible name in one pass via the shared
  `draftParisTrip()` helper) and risks the field-visibility invariant. A true
  step-wizard is **deferred** (would require reworking the shared e2e helper and
  a field-visibility redesign) — recorded as a follow-up, not shipped here.
- **"Real imagery"** uses the repo's own staged product screenshots under
  `apps/web/public/shots/` (compliant, first-party) for the agent auth surface,
  and CSS gradient treatments (the theme's established technique) elsewhere. No
  third-party or fabricated place imagery is introduced (Constitution
  Compliance & Content Sourcing).
- **Scope of "both surfaces"**: the shared theme kit (`globals.css`) cascades to
  every surface. Markup polish targets the three surfaces the ticket names —
  planner, auth (agent + client), booking review — plus any surface the shared
  kit touches for free. The white-label client surface (`/view`, `[data-plain]`)
  stays brand-neutral: no platform naming, no agent-product screenshots.
- **No palette change / no dark mode** — the `globals.css` header already pins
  this constraint to `goal-ui-depoliteform`. Honored: this feature extends
  spacing, typography, component craft, and structure within the existing
  tokens; it adds **no new palette variables and no dark-mode overrides**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent plans a trip through a guided, premium form (Priority: P1)

An agent opens the AI Builder (`/workspace`) and, instead of a flat stack of
uppercase labels over bare inputs, sees a crafted planner: a short intro, the
fields grouped into titled sections ("Destination & dates", "Who's travelling",
"Budget & style") with helper hints, refined inputs, and a clear primary action.
The plan→book flow reads as a guided sequence rather than an undifferentiated
form dump.

**Why this priority**: The planner is the acquisition hook (Principle II — the
build layer must match/beat incumbents on polish). It is the surface the ticket
and GOAL.md D5 call out first.

**Independent Test**: Load `/workspace` as a signed-in agent; confirm the
planner renders grouped sections with hints and premium controls, every field is
still fillable by its accessible name, and drafting → compare → book still works
end-to-end.

**Acceptance Scenarios**:

1. **Given** a signed-in agent on `/workspace`, **When** the planner renders,
   **Then** the trip form presents as titled, grouped sections with helper text
   and refined field styling — not a single bare label/input stack.
2. **Given** the restyled planner, **When** the agent fills destination, dates,
   party size, budget, trip style, and budget mode and submits, **Then** the
   draft/compare/book flow completes exactly as before (no behavioral change).
3. **Given** the existing e2e suite, **When** it runs against the restyle,
   **Then** every field remains reachable by its exact accessible name and the
   segmented controls keep `radiogroup`/`radio` semantics.

### User Story 2 - Sign-in / sign-up feels like a product, not a form (Priority: P1)

A visitor reaching agent sign-in/sign-up sees a premium branded split: a story
panel (eyebrow, headline, trust points, a real product preview) beside the
credentials card — not a lone stack of two labeled inputs. The traveler
(client) sign-in/sign-up gets the same crafted treatment while staying strictly
brand-neutral (white-label): no platform name, no agent-product imagery.

**Why this priority**: Auth is the first authenticated screen; a Google-Form
login undercuts the premium positioning immediately.

**Independent Test**: Load `/sign-in`, `/sign-up`, `/view/sign-in`,
`/view/sign-up`; confirm each renders a premium layout with the credentials card
intact, exact field labels, one alert region, and correct brand posture
(platform brand allowed on agent auth, forbidden on client auth).

**Acceptance Scenarios**:

1. **Given** the agent `/sign-in` page, **When** it renders, **Then** it shows a
   premium branded layout (story/visual panel + card), and the email/password
   fields, the alert region, and the "Sign in" action are unchanged in behavior.
2. **Given** the client `/view/sign-in` page, **When** it renders, **Then** it
   is premium and brand-neutral — no "TripForge"/"Trellis" text appears.
3. **Given** sign-up on either surface, **When** submitted with valid input,
   **Then** account creation succeeds exactly as before.

### User Story 3 - Booking review reads as a considered summary (Priority: P2)

When an agent quotes live prices, the review is a polished, scannable summary
(clear header, emphasized client total, refined table with legible net/markup/
client columns and hold status) rather than a plain HTML table — while keeping
the exact columns, testids, and money semantics.

**Why this priority**: Booking is the money moment; polish here reinforces trust,
but it is lower-risk/scope than the planner and auth and depends on neither.

**Independent Test**: Draft a trip, set a markup, quote live prices; confirm the
quote review renders as a premium summary and "Book selected items" still books
and shows a confirmation.

**Acceptance Scenarios**:

1. **Given** a quoted trip, **When** the review renders, **Then** it presents as
   a premium summary with the same columns (Book/Item/Net/Markup/Client/Hold),
   testids, and price semantics.
2. **Given** the review, **When** the agent books selected items, **Then**
   booking completes and the confirmation renders as before.

### Edge Cases

- **Narrow viewport (~375px)**: grouped sections, auth split, and the quote
  table must reflow to a single column without horizontal scroll.
- **Reduced motion**: any added transitions must respect
  `prefers-reduced-motion` (the theme already globally disables motion under it).
- **White-label leak**: no restyle may introduce platform naming or the `◇`
  brand mark on any `[data-plain]` / `/view` surface.
- **Missing product shot**: if a staged screenshot is absent, the auth visual
  panel must degrade to a gradient, never a broken image.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The shared theme kit (`apps/web/app/globals.css`) MUST be extended
  in place (no per-page style forks) to provide premium field, button, and
  form-section craft. All new styling MUST use existing palette tokens — no new
  color variables and no dark-mode overrides.
- **FR-002**: The planner form MUST present as titled, grouped sections with
  helper hints and refined controls, so it no longer reads as a single bare
  label/input stack — while keeping every field reachable by its current exact
  accessible name (`Destination`, `Check-in`, `Check-out`, `Adults`, `Children`,
  `Budget`, `Currency`) and both segmented controls (`Trip style`, `Budget mode`)
  as `radiogroup`/`radio`.
- **FR-003**: Agent auth (`/sign-in`, `/sign-up`) MUST render a premium branded
  layout (story/visual panel + credentials card) using a first-party product
  image, preserving the exact field labels (`Email`, `Password`, `Your name`,
  `Agency name`), the single `role="alert"` region, and the CTA labels.
- **FR-004**: Client auth (`/view/sign-in`, `/view/sign-up`) MUST render the same
  premium quality while remaining strictly brand-neutral (white-label): no
  platform naming, no `◇` mark, no agent-product imagery.
- **FR-005**: The booking quote review MUST render as a premium, scannable
  summary (emphasized client total, refined table) while preserving the exact
  columns, all testids (`booking-flow`, `quote-review`, `booking-confirmation`),
  and the price/markup semantics.
- **FR-006**: The restyle MUST NOT regress the home smoke contract: the `/`
  hero heading named "TripForge" and the `/Agency workspace/i` link remain, and
  `/view` keeps the white-label negatives (no platform name).
- **FR-007**: The full Playwright e2e suite MUST pass unchanged in assertion
  strength: all `getByLabel` names, `getByRole` names, segmented-control roles,
  testids, and directly-asserted `.tf-client-*` / `.tf-price-note` class
  selectors continue to resolve. The shared `draftParisTrip()` helper MUST NOT
  require weakening.
- **FR-008**: All new visual treatments MUST reflow to a single column at ~375px
  with no horizontal overflow and MUST respect `prefers-reduced-motion`.

### Key Entities

None. This feature is presentation-only: no canonical itinerary schema change,
no money-math change, no supply-adapter change, no new data entities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Planner, agent auth, client auth, and booking review no longer
  present as bare label/input stacks — verified by before/after screenshots in
  the PR evidence.
- **SC-002**: `npm run lint` and `npm test` pass; the full `npx playwright test`
  e2e suite is green with no assertion weakened.
- **SC-003**: The L3 live smoke (`tests/integration/smoke.mjs`) passes against
  the built compose stack, and the compose logs show no non-allowlisted ERROR.
- **SC-004**: No platform-name leak on any `[data-plain]`/`/view` surface
  (white-label negative still asserted green).
