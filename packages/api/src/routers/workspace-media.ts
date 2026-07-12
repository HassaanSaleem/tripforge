// workspace.media.* — agent-gated media library procedures (spec 015
// contracts §1-3). The closed MediaSource enum is enforced here via Zod
// (belt) and again inside SandboxMediaStoreAdapter (suspenders) — never
// trust one layer alone for a set this consequential (Compliance & Content
// Sourcing).
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, agentProcedure } from "../trpc.js";
import { registerMedia, listMedia, getMedia } from "../services/media.js";

const mediaSourceSchema = z.enum(["licensed-stock", "official-embed", "agent-upload", "traveler-ugc"]);
const mediaKindSchema = z.enum(["image", "video", "embed"]);

const registerInputSchema = z.strictObject({
  source: mediaSourceSchema,
  kind: mediaKindSchema,
  url: z.string().url(),
  alt: z.string().min(1),
  attribution: z.string().optional(),
});

const getInputSchema = z.strictObject({ mediaAssetId: z.uuid() });

/**
 * Named-member refusal for the closed MediaSource enum (D-006.c). Checked
 * ahead of the full schema parse so a caller outside the closed set gets a
 * typed message naming every allowed value, not a generic zod issue dump.
 */
function parseRegisterInput(value: unknown): z.infer<typeof registerInputSchema> {
  const candidate = (value ?? {}) as { source?: unknown };
  const sourceCheck = mediaSourceSchema.safeParse(candidate.source);
  if (!sourceCheck.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Media source must be one of: ${mediaSourceSchema.options.join(", ")}.`,
    });
  }
  return registerInputSchema.parse(value);
}

export const workspaceMediaRouter = router({
  /** Register a media item into the caller's own agency library (US1). */
  register: agentProcedure
    .input((value) => parseRegisterInput(value))
    .mutation(({ ctx, input }) => registerMedia(ctx.container, ctx.session, input)),

  /** The agency's own media library, newest first (tenant-scoped, INV-004). */
  list: agentProcedure.query(({ ctx }) => listMedia(ctx.container, ctx.session)),

  /** A single media asset — not_found for unknown or cross-tenant ids. */
  get: agentProcedure
    .input((value) => getInputSchema.parse(value))
    .query(({ ctx, input }) => getMedia(ctx.container, ctx.session, input.mediaAssetId)),
});
