// Day — an ordered container of items. `dayNumber` is the stable ordering key; a
// day may carry an optional per-day subtotal (Money, in the itinerary currency).
// A day with zero items is valid (an unplanned day) — see spec Edge Cases.
import { z } from "zod";
import { MoneySchema } from "./money.js";
import { ItemSchema } from "./item.js";

export const DaySchema = z
  .object({
    dayNumber: z.number().int().min(1), // stable ordering key
    date: z.string().optional(), // ISO date; optional (unscheduled draft)
    subtotal: MoneySchema.optional(),
    items: z.array(ItemSchema).default([]),
  })
  .strict();
export type Day = z.infer<typeof DaySchema>;
