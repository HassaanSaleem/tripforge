# Research: Workspace AI Itinerary Planner UI

**Feature**: specs/008-planner-workspace-ui | **Date**: 2026-07-09

All Technical Context unknowns resolved. Decisions numbered D1–D9 for citation from
data-model/contracts/tasks and the PR body; D10–D11 added during the Live Test & Fix
cycle (INV-027 defects fixed in the same cycle) and the seed-0009s premium-bar update.

## D1 — Transport: typed `@trpc/client` over the existing `/api/trpc` mount

- **Decision**: Add `@trpc/client` to `apps/web` and create a typed proxy client
  (`createTRPCClient<AppRouter>`) targeting the existing fetch-adapter mount at
  `/api/trpc`. The browser calls the same procedure surface mobile will use.
- **Rationale**: INV-018 names the tRPC router "the single server surface web +
  mobile consume"; the mount already exists and is already the L2/e2e-probed
  security boundary (agentProcedure). A typed client gives end-to-end types from
  `AppRouter` with zero server changes, and becomes the shared wiring for the
  follow-up demo-path tickets (seed-0009b booking UI, seed-0009d marketplace UI).
- **Alternatives considered**:
  - *Next.js server action calling `appRouter.createCaller` server-side* — zero new
    deps, but creates a second RPC surface (the action endpoint) parallel to the
    mounted router; weaker INV-018 story and nothing reusable for later UI tickets.
  - *Hand-rolled `fetch` against the tRPC wire protocol* — no new dep but re-implements
    `@trpc/client` untyped and brittle against protocol details; rejected as
    reinventing a first-party client.

## D2 — Version pin: `@trpc/client@11.18.0` exact

- **Decision**: Exact-pin `@trpc/client` to `11.18.0`, the version `@trpc/server`
  resolves to in `pnpm-lock.yaml`.
- **Rationale**: tRPC v11 expects client and server on the same version; a caret
  range would let the client drift ahead of the locked server on a future install.
- **Alternatives considered**: `^11.0.0` (matches the server's declared range but
  can skew from the locked resolution) — rejected.

## D3 — Link + serialization: `httpBatchLink`, no transformer, relative URL

- **Decision**: Single `httpBatchLink({ url: "/api/trpc" })`. No transformer.
- **Rationale**: The server's `initTRPC` uses no transformer, so the client must not
  either. The client module is browser-only (imported from a `"use client"`
  component), so a relative same-origin URL is valid and automatically carries the
  Better Auth session cookie (same-origin fetch default). Batching is the tRPC
  default and free future-proofing for multi-call screens.
- **Alternatives considered**: `httpLink` (no batching) — equivalent today, less
  useful tomorrow; absolute URL from env — unnecessary for a same-origin browser
  client and adds config surface.

## D4 — Page gating stays in the server component (spec 007 pattern)

- **Decision**: `workspace/page.tsx` keeps its `getWorkspaceIdentity()` branch: a
  verified agent gets the greeting + the new `<Planner>` client component; everyone
  else keeps the exact membership prompt shipped by spec 007. No middleware, no
  client-side redirects.
- **Rationale**: INV-024 — the page gate is UX, not the security boundary; INV-023
  authorization continues to live in `agentProcedure`, which the draft mutation
  already uses. The e2e trust-boundary specs pin this separation.
- **Alternatives considered**: client-side session probing before rendering the
  form — duplicates the identity logic and races the server-rendered prompt;
  rejected.

## D5 — Draft outcome typing: infer from `AppRouter`

- **Decision**: Type the mutation result as
  `inferRouterOutputs<AppRouter>["workspace"]["itinerary"]["draft"]` (via
  `@trpc/server`, already a dependency of `apps/web`).
- **Rationale**: `DraftOutcome` is intentionally NOT exported from `@tripforge/api`
  (QS3-1 premature-export cleanup); router inference is the sanctioned way to get
  the exact union (`drafted | infeasible | planner_failed`) without re-widening the
  package surface.
- **Alternatives considered**: re-exporting `DraftOutcome` from `@tripforge/api` —
  reverses a merged quality-sweep decision for no gain; duplicating the union in
  the web app — drift risk; both rejected.

## D6 — Failure mapping: one pure helper, unit-tested

- **Decision**: A pure function in `apps/web/lib/planner-form.ts` maps every
  outcome to display state: typed business failures
  (`infeasible: budget_below_reserve | no_days`,
  `planner_failed: malformed_output | no_proposals`) and thrown `TRPCClientError`s
  (UNAUTHORIZED / FORBIDDEN → sign-in/membership guidance; BAD_REQUEST → check the
  form; anything else / network → "could not reach the server, try again") each get
  a distinct human-readable message (FR-006/007). The component only displays what
  the helper returns.
- **Rationale**: Keeps the component thin and makes FR-006/007 unit-testable in
  Vitest without a DOM.
- **Alternatives considered**: inline mapping in the component — untestable under
  the current Vitest setup (no DOM environment configured); rejected.

## D7 — Money display: format exact minor units via `Intl` fraction digits

- **Decision**: A pure `formatMinorAmount(amountMinor, currency)` helper renders an
  integer minor-unit value as `major.fraction CUR` using the currency's fraction
  digits from `Intl.NumberFormat` resolved options (locale pinned to `en` for
  deterministic output), e.g. `250000, "EUR" → "2,500.00 EUR"`. The budget input is
  collected in major units and converted to integer minor units once at submit
  (`Math.round(major * 10^fractionDigits)` guarded to an integer) — the only
  client-side numeric conversion, at the form boundary, before the API call.
- **Rationale**: FR-009/SC-004 — displayed values must be the platform's exact
  integers formatted for display; fraction digits differ per currency (EUR 2, JPY
  0), and `Intl` is the standard source for that metadata. Reuse scan found no
  existing formatter anywhere in `packages/` or `apps/` (grep for
  `Intl.NumberFormat|toFixed|formatMoney|formatMinor` — zero product hits), so this
  is a justified `new`, kept in the presentation layer where it belongs (INV-010:
  money *math* lives in `packages/domain`; this is display formatting and input
  encoding, not markup/take-rate/share arithmetic).
- **Alternatives considered**: hardcoded `/100 + toFixed(2)` — wrong for 0- and
  3-decimal currencies; putting the formatter in `packages/domain` — it is
  presentation, not domain money math, and no second consumer exists yet
  (extraction threshold not met); both rejected.

## D8 — Unit-test inclusion for `apps/web`

- **Decision**: Add `"apps/web/lib/**/*.test.ts"` to the root `vitest.config.ts`
  `include` array so the new pure helpers run under the existing oracle command.
- **Rationale**: The current include covers only `packages/**` and `tests/live/**`;
  without the line, new web view-logic would ship with zero CI test coverage
  (quality-bar violation). This BROADENS what the oracle runs — the oracle command
  (`pnpm test`, sealed in `kitchenloop.yaml`) and every existing assertion are
  untouched, so it is a normal-pipeline test-infra addition, not a gate change.
- **Alternatives considered**: placing the helpers in `packages/shared` just to be
  testable — misplaces web presentation logic in a leaf utility package; e2e-only
  coverage — leaves `pnpm test`/CI blind to the mapping logic; both rejected.

## D9 — Form state: plain React state, house pattern

- **Decision**: `useState`-driven controlled form + pending/error state, exactly
  like `sign-in-form.tsx` / `sign-up-form.tsx` (spec 007). No form library, no
  design system; inline `style` presentation consistent with the existing pages.
- **Rationale**: Matches the established convention; the form has 8 fields and one
  submit path — a dependency would be pure overhead (simplicity default).
- **Alternatives considered**: react-hook-form/zod-resolver — new dependencies for
  no P0 gain; `useActionState`/server actions — see D1 rejection; both rejected.
- **SUPERSEDED (presentation half only)** by D11: seed-0009s landed the product
  theme (operator, 2026-07-09) after this decision was written — presentation now
  rides the `.tf-*` kit, not inline `style`. The state-management half stands.

## D10 — Live fix: pin the planner's tool-lookup criteria to the canonical trip request

- **Decision**: The tool executors the API layer injects into the LLM tool loop
  (`plannerToolDeps`, `packages/api/src/services/planner.ts`) derive their supply
  search criteria from ONE `canonicalCriteria(request)` helper — shared with the
  assembly-time verification sweep (`verifiedSupplyCatalog`) — and IGNORE the
  trip-scoped fields of the model's tool-call arguments (destination, dates,
  party size, transfer endpoints). The model keeps full control over WHICH
  returned offers it proposes; it can no longer search a different trip than the
  agent described.
- **Rationale**: The live journey (real Haiku loop — the stack env carries
  `ANTHROPIC_API_KEY`) rendered near-empty itineraries: supply offer identity is
  keyed off the search-criteria strings, so when the model phrases criteria its
  own way ("Paris, France" for a "Paris" trip), the offers it is shown — and
  honestly proposes — are unknown to the canonical verification sweep and every
  such proposal drops as `unknown_offer` (spec 005 FR-003 drop rule doing its
  job against a criteria-drift bug, not model misbehaviour). Pinning makes the
  offers the model sees exactly the offers verification re-reads, and keeps the
  persisted `supplyRef.externalId`s canonical so the quote flow's INV-028 hold
  re-establishment (which re-sweeps from the persisted trip request in a fresh
  process) keeps working. FR-003 verification itself is untouched: hallucinated
  offerIds still drop.
- **Alternatives considered**: *record the tool-loop results and verify against
  that recorded catalog* — equally trustworthy for drafting (offers still come
  from the ports) but persists model-phrased offer keys, which a fresh-process
  quote re-establishment can never re-derive (INV-028 money-path hazard);
  *prompt harder* ("always search with the exact destination") — non-deterministic,
  unenforceable; *add a getOffer(id) port verb* — changes the sealed supply-port
  family (spec 003) for a problem the app layer can solve; all rejected.

## D11 — Presentation: seed-0009s theme kit (premium bar), test-relied selectors frozen

- **Decision**: The planner surface (workspace shell + form + rendered draft +
  budget-fit table) is built on the `globals.css` theme and `.tf-*` component kit
  (cards, sticky branded header with the agent's name · agency · role badge,
  timeline-dot item rows, state badges, draft-reveal/drafting motion honoring
  `prefers-reduced-motion`). All test-relied selectors are UNCHANGED: field
  labels, the "Draft itinerary"/"Drafting…" button, `data-testid="draft-result"`
  / `"budget-fit"`, the `fits|underFilled|overTarget` literals, "No items
  planned.", and the `role="alert"` failure region (contract §2.1 intact). One
  theme-layer hardening rides along: label-wrapped inputs no longer inherit the
  label's 12px/uppercase typography (`label > input` rule) — presentation only,
  benefits sign-in/up too.
- **Rationale**: seed-0009s (operator, 2026-07-09) set the premium bar — "build
  all surfaces on the globals.css theme/.tf-* kit to this look. No bare pages."
  The spec's original "minimal styling" assumption predates that decision.
- **Alternatives considered**: shipping the bare-HTML planner and restyling in a
  follow-up — violates the operator's explicit no-bare-pages bar for demo
  surfaces; a component library dependency — the theme kit already covers the
  need with zero deps; both rejected.
