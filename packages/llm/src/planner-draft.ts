// The planner's structured-output vocabulary (spec 005, research D2/D5):
// offer references + hints ONLY. No pricing, no provenance, no version field —
// a shape that cannot carry money or provenance is a proposal vocabulary, not
// a fork of the canonical itinerary (INV-001). Validated with zod (v4) at the
// submit-tool boundary; the SDK feeds validation errors back to the model, so
// a malformed draft is retried, never accepted.
import { z } from "zod";

export const PlannerDraftItemSchema = z.discriminatedUnion("port", [
  z.strictObject({
    port: z.literal("hotel"),
    offerId: z.string().min(1).describe("offerId of a stay returned by search_hotel_rates"),
  }),
  z.strictObject({
    port: z.literal("activity"),
    offerId: z.string().min(1).describe("offerId returned by search_activities"),
    startsAt: z.string().optional().describe("ISO datetime start hint"),
  }),
  z.strictObject({
    port: z.literal("transfer"),
    offerId: z.string().min(1).describe("offerId returned by quote_transfer"),
  }),
]);
export type PlannerDraftItem = z.infer<typeof PlannerDraftItemSchema>;

export const PlannerDraftSchema = z.strictObject({
  title: z.string().min(1).describe("Client-facing trip title"),
  days: z
    .array(
      z.strictObject({
        items: z.array(PlannerDraftItemSchema).describe("Proposed items for this day, in order"),
      }),
    )
    .min(1)
    .describe("One entry per trip day, in order"),
});
export type PlannerDraft = z.infer<typeof PlannerDraftSchema>;

// ─── Multi-option drafting (spec 019) ─────────────────────────────────────
// A trip request now yields 1-3 labeled candidate drafts instead of exactly
// one — a fixed, server-owned vocabulary (never freeform text), mirroring
// DraftStep's existing fixed-vocabulary pattern. Each named draft is still
// JUST a PlannerDraft (offer references + hints only, INV-001 unaffected) —
// comparison/selection is orchestrated one layer up (packages/api).
export const DRAFT_VARIANTS = ["budgetSavvy", "balanced", "premium"] as const;
export type DraftVariant = (typeof DRAFT_VARIANTS)[number];

export const DRAFT_VARIANT_LABELS: Record<DraftVariant, string> = {
  budgetSavvy: "Budget-savvy",
  balanced: "Balanced",
  premium: "Premium",
};

export const NamedPlannerDraftSchema = z.strictObject({
  variant: z.enum(DRAFT_VARIANTS).describe("Which themed option this draft represents"),
  draft: PlannerDraftSchema,
});
export type NamedPlannerDraft = z.infer<typeof NamedPlannerDraftSchema>;

export const NamedPlannerDraftsSchema = z
  .array(NamedPlannerDraftSchema)
  .min(1)
  .max(DRAFT_VARIANTS.length)
  .refine((drafts) => new Set(drafts.map((d) => d.variant)).size === drafts.length, {
    message: "Each variant may be proposed at most once",
  });
export type NamedPlannerDrafts = z.infer<typeof NamedPlannerDraftsSchema>;
