# UI Contract: Planner (redesigned)

This feature has no network/API contract change — `apps/web` remains the only consumer of the unchanged `workspace.itinerary.draft` tRPC subscription (`DraftInput` in, `DraftEvent`/`DraftOutput` stream out, both defined in `@tripforge/api` and re-exported by `apps/web/lib/trpc/client.ts`). What follows is the **observable UI contract** — the stable hooks (test ids, accessible roles/labels, and pure-function signatures) that tests, Live Test & Fix (Playwright), and the UAT evaluator can rely on.

## Pure-logic contract (`apps/web/lib/planner-form.ts`)

Existing exports — signatures unchanged:

- `toTripRequest(values: PlannerFormValues): { request: DraftInput } | { error: string }`
- `draftFailureMessage(outcome: NonDraftedOutcome): string`
- `draftErrorMessage(error: unknown): string`
- `formatMinorAmount(amountMinor: number, currency: string): string`
- `currencyFractionDigits(currency: string): number`

New exports:

- `HERO_DESTINATIONS: HeroDestination[]` — the seeded list (see data-model.md), stable order (declaration order), used by both the picker and the hero-card gradient resolver.
- `BUDGET_MODE_LABELS: Record<PlannerFormValues["budgetMode"], string>`
- `TRIP_STYLE_LABELS: Record<Exclude<PlannerFormValues["tripStyle"], "">, string>`
- `resolveDestinationTreatment(destination: string): { flag: string; gradient: string }` — pure, total function (always returns a value; unmatched input returns the default treatment), never throws.

`PlannerFormValues` and `toTripRequest`'s accepted/returned shapes are **unchanged** — the redesigned controls must produce exactly the same `PlannerFormValues` values (`budgetMode`, `tripStyle`, `destination` as plain strings) that the current `<select>`/`<input>` controls produce today.

## Rendered-DOM contract (`apps/web/app/(workspace)/workspace/planner.tsx`)

Stable hooks for browser-driven verification (Live Test & Fix, UAT):

| Element | Selector | Contract |
|---|---|---|
| Destination input | `input#destination` (existing id preserved) | Always present; accepts free text; `aria-expanded` reflects picker-panel open state |
| Destination picker panel | `[data-testid="destination-picker"]` (new) | Rendered only while the destination input is focused/open; contains one button per matching `HeroDestination` |
| Destination picker option | `[data-testid="destination-option"]` (new), one per `HeroDestination`, `data-destination-id={id}` | Clicking sets `input#destination`'s value to `"{city}, {country}"` and closes the panel |
| Budget-mode control | `[data-testid="budget-mode-control"]` (new), `role="radiogroup"`, `aria-label="Budget mode"` | Contains one `role="radio"` button per `BUDGET_MODE_LABELS` entry; exactly one has `aria-checked="true"` at all times |
| Trip-style control | `[data-testid="trip-style-control"]` (new), `role="radiogroup"`, `aria-label="Trip style"` | Contains one `role="radio"` button per `TRIP_STYLE_LABELS` entry plus a "No preference" option; exactly one has `aria-checked="true"` at all times |
| Draft result | `[data-testid="draft-result"]` (existing id preserved from current plain-table markup) | Rendered only when `view.phase === "drafted"`; now a hero-card layout instead of a plain table |
| Draft hero header | `[data-testid="draft-hero-header"]` (new), inside the draft result | Shows itinerary title + total price, background styled per `resolveDestinationTreatment` |
| Budget-fit table | `[data-testid="budget-fit"]` (existing id preserved) | Same row/column data as today (category, allocated, planned, state) — layout may be restyled, data unchanged |

**Invariant carried over unmodified**: `BookingFlow` and `ShareControl` are still rendered only inside a `"drafted"` view, keyed the same way (`key={view.outcome.itinerary.id}` / `key={\`share-${view.outcome.itinerary.id}\`}`) — this feature does not touch that composition.

**Failure/loading states unchanged**: the `"drafting"` spinner text (`STEP_LABEL` map) and the `"failed"` `role="alert"` message are unchanged verbatim (FR-010).
