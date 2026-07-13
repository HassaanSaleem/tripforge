# Data Model: Multi-Option AI Itinerary Generation

No changes to the canonical itinerary schema (`packages/itinerary-schema`) or
any persisted table shape. This feature only changes in-memory/wire vocabulary
between `packages/llm`, `packages/api`, and `apps/web`.

## DraftVariant (new, packages/llm)

```ts
type DraftVariant = "budgetSavvy" | "balanced" | "premium";

const DRAFT_VARIANT_LABELS: Record<DraftVariant, string> = {
  budgetSavvy: "Budget-savvy",
  balanced: "Balanced",
  premium: "Premium",
};
```

Fixed, server-owned enum — never freeform text (mirrors `DraftStep`'s existing
fixed-vocabulary pattern in `port.ts`).

## NamedPlannerDraft (new, packages/llm/planner-draft.ts)

```ts
interface NamedPlannerDraft {
  variant: DraftVariant;
  draft: PlannerDraft; // UNCHANGED shape (title + days[].items[])
}
```

`PlannerDraftSchema`/`PlannerDraftItemSchema` are byte-for-byte unchanged — a
`NamedPlannerDraft` just tags an existing `PlannerDraft` with which variant it
is. No pricing, no provenance (INV-001 unaffected).

## DraftItineraryResult (packages/llm/port.ts) — CHANGED

```ts
// BEFORE
type DraftItineraryResult =
  | { status: "drafted"; draft: PlannerDraft; usage: LlmUsage }
  | { status: "failed"; reason: "malformed_output" | "no_proposals" };

// AFTER
type DraftItineraryResult =
  | { status: "drafted"; drafts: NamedPlannerDraft[]; usage: LlmUsage } // 1-3 entries, distinct
  | { status: "failed"; reason: "malformed_output" | "no_proposals" };
```

This is the ONLY breaking shape change, confined to the `LLMPort` boundary.
Every implementor (`FakeLLM`, `AnthropicLLM`) and every direct consumer
(`packages/api/src/services/planner.ts`, and the existing L3 test
`l3-planner-verification.test.ts`) is updated in the same PR — no supplier or
UI code depends on this shape directly, so the blast radius is fully contained
to those files.

## DraftOption (new, packages/api/services/planner.ts) — compare-time, never persisted

```ts
interface DraftOption {
  variant: DraftVariant;
  label: string;               // DRAFT_VARIANT_LABELS[variant]
  itinerary: Itinerary;         // fully assembled canonical Itinerary — NOT written to DB
  fit: AssembleResult["fit"];
}
```

Each `itinerary.id` is a fresh `randomUUID()` generated purely in-memory for
React key stability during comparison; it is discarded (never referenced
again) for any option that isn't selected, and a NEW id is minted at
persistence time for the option that is (selection re-runs assembly from
scratch per D1 — it does not reuse the comparison-time id or object).

## DraftOutcome (packages/api/services/planner.ts) — CHANGED for the compare path only

```ts
// draftOptions() terminal outcome (compare, no persistence):
type CompareOutcome =
  | { status: "drafted"; options: DraftOption[] }        // 1-3 entries
  | { status: "infeasible"; reason: "budget_below_reserve" | "no_days" }
  | { status: "planner_failed"; reason: "malformed_output" | "no_proposals" };

// selectDraftOption() terminal outcome (persists) — UNCHANGED shape from
// today's single-draft DraftOutcome, so BookingFlow/ShareControl/DraftResult
// need zero changes downstream of a successful selection:
type SelectOutcome =
  | { status: "drafted"; itinerary: Itinerary; fit: AssembleResult["fit"] }
  | { status: "infeasible"; reason: "budget_below_reserve" | "no_days" }
  | { status: "planner_failed"; reason: "malformed_output" | "no_proposals" };
```

## State transitions

```
[idle] --submit trip request--> [comparing] --pick variant--> [selecting] --persisted--> [drafted] (existing view)
                                     |                              |
                                     +-- infeasible/failed ---------+-- infeasible/failed (re-verification found nothing plannable)
```

`[comparing]` has no persisted state — abandoning it (closing the tab, editing
the form again) leaves zero trace, matching the spec's edge case for
abandonment.
