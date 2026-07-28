# Tasks: Premium UX — kill the "Google Form" look

**Feature**: `034-premium-ux-depoliteform` | **Ticket**: `goal-ui-depoliteform`

Dependency-ordered. `[P]` = parallelizable with siblings (different files).
All tasks are presentation-only; none change accessible names, roles, testids,
class hooks, money math, schema, or adapters.

## Phase 1: Shared kit (foundation — everything else cascades from it)

- **T001** — Extend `apps/web/app/globals.css`: refine base `input/select/
  textarea` (field surface, padding, focus), `label` rhythm, and `button`/
  `.tf-btn` weight/size. Add a **premium form-section system**
  (`.tf-form-section`, `.tf-form-sectionhead`, `.tf-field-hint`) and an
  **auth split system** (`.tf-auth-split`, `.tf-auth-aside`, `.tf-auth-*`
  story bits). Add booking-review summary polish (`.tf-quote-summary`,
  `.tf-quote-total`, table hover/zebra). Existing tokens only — no new palette,
  no dark mode. Responsive single-column at ≤640/880px; respects reduced motion.
  → FR-001, FR-005, FR-008

## Phase 2: Surface markup (contract-safe wrappers) — [P] across files

- **T002 [P]** — `planner.tsx`: group the `.tf-planner-form` fields into titled
  sections ("Destination & dates", "Who's travelling", "Budget & style") via
  `.span-2` section-head rows + field hints; add a short planner intro. Keep
  every field, label string, segmented-control role/label, and testid intact.
  → FR-002
- **T003 [P]** — `components/auth-brand-panel.tsx` (NEW) + `sign-in/page.tsx` +
  `sign-up/page.tsx`: wrap the credentials card in `.tf-auth-split` with a
  first-party product-shot story panel (agent surface — platform brand allowed).
  Degrade to gradient if the shot is missing. Preserve field labels, alert
  region, CTA labels. → FR-003
- **T004 [P]** — `view/client-auth-shell.tsx`: apply the premium auth layout to
  client sign-in/up, strictly brand-neutral (no platform name, no `◇`, no
  product shot; gradient story panel only). → FR-004
- **T005 [P]** — `booking-flow.tsx`: wrap the quote review in the premium summary
  (emphasized client total, refined table) using the new classes; keep columns,
  testids, and price semantics. → FR-005

## Phase 3: Verify

- **T006** — `npm run lint` + `npm test` (unit/integration) green. → SC-002
- **T007** — Full `npx playwright test` e2e green with no assertion weakened;
  confirm `draftParisTrip()` and auth/booking journeys pass unchanged. → FR-007, SC-002
- **T008** — Live: build compose stack, run `tests/integration/smoke.mjs`,
  scan compose logs (no non-allowlisted ERROR). → SC-003
- **T009** — Playwright MCP QA journey: capture before/after screenshots of
  planner, agent auth, client auth, booking review into the evidence dir;
  confirm white-label negatives on `/view`. → SC-001, SC-004

## Deferred (recorded, not shipped)

- **D1** — True step-wizard planner (multi-step with progressive field mounting)
  — requires reworking the shared `draftParisTrip()` e2e helper and a
  field-visibility redesign. File a follow-up ticket. Out of scope per the
  Clarifications in `spec.md`.
