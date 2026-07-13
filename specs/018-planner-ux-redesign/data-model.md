# Phase 1 Data Model: Planner UX Redesign

This feature adds no server-side data, no database tables, and no changes to the canonical itinerary schema (`packages/shared`) or the `DraftInput`/`DraftOutput` tRPC types. Every "entity" below is a presentation-layer-only constant or derived value living in `apps/web`.

## Entity: `HeroDestination` (new, client-side constant)

Represents one seeded, human-facing destination option in the picker.

| Field       | Type     | Notes                                                                 |
|-------------|----------|------------------------------------------------------------------------|
| `id`        | `string` | Stable key for React lists, e.g. `"lisbon"`                            |
| `city`      | `string` | e.g. `"Lisbon"`                                                        |
| `country`   | `string` | e.g. `"Portugal"`                                                      |
| `flag`      | `string` | Unicode flag emoji, e.g. `"🇵🇹"` — pure presentation, no i18n logic needed |
| `gradient`  | `string` | CSS `background` value (linear-gradient), matches Decision 3 in research.md |

Seeded values (fixed for this iteration, per spec Assumptions): Lisbon/Portugal, Tokyo/Japan, Marrakech/Morocco, Reykjavik/Iceland.

**Validation rules**: None beyond TypeScript's structural typing — this is static data, not user input.

**Relationship to existing data**: A `HeroDestination`'s `"{city}, {country}"` string, when selected, becomes the plain `destination: string` value already accepted by `DraftInput["destination"]` (`apps/web/lib/planner-form.ts` `toTripRequest`) — no new field, no schema change. Free-text entry produces the same `string` type today.

## Entity: label maps (new, client-side constants)

Two `Record<EnumValue, string>` maps, keyed by the existing server-accepted enum values (no new values introduced):

- `BUDGET_MODE_LABELS: Record<PlannerFormValues["budgetMode"], string>` → `{ hardCap: "Hard cap", target: "Target budget" }`
- `TRIP_STYLE_LABELS: Record<Exclude<PlannerFormValues["tripStyle"], "">, string>` → `{ balanced: "Balanced", budget: "Budget-savvy", premium: "Premium" }` (the `""` "no preference" state keeps its own explicit UI label, e.g. "No preference")

**Validation rules**: TypeScript's `Record<EnumValue, string>` constraint guarantees exhaustiveness at compile time — if the server ever adds/removes a `tripStyle`/`budgetMode` value, this file fails to compile until the map is updated (same exhaustiveness guarantee `draftFailureMessage`'s `switch` already relies on).

**State transitions**: N/A — static lookup tables.

## Derived value: destination → gradient resolution

Given a destination string (from either the picker or free text), the hero result card resolves a gradient by matching against `HERO_DESTINATIONS` (case-insensitive match on `"{city}, {country}"` or bare `city`); no match falls back to a fixed default gradient constant. This is a pure function (`resolveDestinationTreatment(destination: string): { flag: string; gradient: string }`), covered by unit tests, with no side effects and no network access.

## No changes to existing entities

- `DraftInput` / `DraftOutput` (packages/api, imported via `apps/web/lib/trpc/client.ts`) — unchanged.
- Canonical itinerary schema (Constitution Principle IV) — unchanged; no migration note required.
- `PlannerFormValues` interface (`planner-form.ts`) — unchanged in shape; `toTripRequest`'s output contract is unchanged (Decision verified in research.md Decision 1/2 — labels/picker are input-collection UI only, the value that flows into `toTripRequest` is identical to today's raw enum/string values).
