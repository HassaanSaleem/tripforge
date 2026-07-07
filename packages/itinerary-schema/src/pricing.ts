// PricingBlock — the budget breakdown that persists WITH the itinerary (INV-015).
// The five categories are the Constitution-III budget bands. v0 only defines the
// shape; the budget allocator (seed-0005) fills `categories`/`spent` against live
// inventory. flightsTransport is the P0 budget anchor (reserve/manual estimate — no
// live flight lookup, INV-008/022), not a profit line.
import { z } from "zod";
import { MoneySchema } from "./money.js";

export const BudgetCategorySchema = z.enum([
  "flightsTransport",
  "accommodation",
  "activities",
  "localTransport",
  "buffer",
]);
export type BudgetCategory = z.infer<typeof BudgetCategorySchema>;

export const BudgetAllocationSchema = z
  .object({
    category: BudgetCategorySchema,
    allocated: MoneySchema,
    spent: MoneySchema.optional(), // filled by the allocator (seed-0005); optional at v0
  })
  .strict();
export type BudgetAllocation = z.infer<typeof BudgetAllocationSchema>;

export const PricingBlockSchema = z
  .object({
    budgetMode: z.enum(["hardCap", "target"]),
    total: MoneySchema,
    categories: z.array(BudgetAllocationSchema).default([]),
  })
  .strict();
export type PricingBlock = z.infer<typeof PricingBlockSchema>;
