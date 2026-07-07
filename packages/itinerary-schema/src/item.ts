// Item — the leaf of the itinerary graph, a discriminated union on `kind`. Per
// operator decision D-006.b, v0 ships THREE kinds only: stay | activity | transfer
// (carRental is deferred to a later operator-gated version bump). `supplyRef` is
// supplier-AGNOSTIC (INV-005): an opaque external id + a port discriminator, never a
// supplier API shape — concrete supplier payloads stay inside packages/supply-adapter.
import { z } from "zod";
import { MoneySchema } from "./money.js";
import { MediaRefSchema } from "./media.js";

// A per-item money snapshot: the *values* the booking layer settles on. No
// live-cached rate lives here (INV-025/026) — `supplyRef` links to the port that
// re-quotes. The markup math that relates netRate → sellPrice is pure in domain (INV-010).
export const ItemPricingSchema = z
  .object({
    netRate: MoneySchema, // supplier net (what the agency pays)
    sellPrice: MoneySchema, // client-facing (net + agency markup)
  })
  .strict();
export type ItemPricing = z.infer<typeof ItemPricingSchema>;

// Fields common to every item kind. Spread into each concrete schema below.
const itemBase = {
  id: z.string().min(1),
  title: z.string().min(1),
  supplyRef: z
    .object({
      port: z.enum(["hotel", "activity", "transfer"]), // D-006.b: no "car" port at v0
      externalId: z.string().min(1), // opaque to everyone outside the adapter
    })
    .strict()
    .optional(),
  media: z.array(MediaRefSchema).default([]),
  pricing: ItemPricingSchema.optional(),
};

export const StayItemSchema = z
  .object({
    kind: z.literal("stay"),
    ...itemBase,
    checkIn: z.string(),
    checkOut: z.string(),
    occupancy: z
      .object({
        adults: z.number().int().min(1),
        children: z.number().int().min(0).default(0),
      })
      .strict(),
  })
  .strict();
export type StayItem = z.infer<typeof StayItemSchema>;

export const ActivityItemSchema = z
  .object({
    kind: z.literal("activity"),
    ...itemBase,
    startsAt: z.string().optional(),
    durationMinutes: z.number().int().positive().optional(),
  })
  .strict();
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

export const TransferItemSchema = z
  .object({
    kind: z.literal("transfer"),
    ...itemBase,
    from: z.string().min(1),
    to: z.string().min(1),
    mode: z.enum(["private", "shared", "rail", "other"]),
  })
  .strict();
export type TransferItem = z.infer<typeof TransferItemSchema>;

export const ItemSchema = z.discriminatedUnion("kind", [
  StayItemSchema,
  ActivityItemSchema,
  TransferItemSchema,
]);
export type Item = z.infer<typeof ItemSchema>;
