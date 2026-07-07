// MediaRef — a REFERENCE to media, never the binary (INV-025): static content is
// materialized into Postgres derived tables / CDN by packages/db; the itinerary
// carries only the key/url. `source` is a CLOSED, licensed-only enum (Constitution
// Compliance & Content Sourcing, D-006.c) — there is deliberately NO member that
// could hold scraped or AI-fabricated-as-real imagery.
import { z } from "zod";

export const MediaSourceSchema = z.enum([
  "licensed-stock", // Google Places Photos / Unsplash / Pexels class
  "official-embed", // official social embed
  "agent-upload", // authentic agent-provided asset
  "traveler-ugc", // authentic traveler UGC
]);
export type MediaSource = z.infer<typeof MediaSourceSchema>;

export const MediaRefSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["image", "video", "embed"]),
    storageKey: z.string().min(1).optional(), // derived-table / CDN key (db materializes)
    url: z.string().url().optional(), // for official embeds
    source: MediaSourceSchema,
    alt: z.string().min(1), // accessibility + provenance discipline
    attribution: z.string().optional(),
  })
  .strict()
  .refine((m) => Boolean(m.storageKey || m.url), {
    message: "media ref needs a storageKey or url",
  });
export type MediaRef = z.infer<typeof MediaRefSchema>;
