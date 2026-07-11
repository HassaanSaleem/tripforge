// Postgres-backed media library adapter (spec 015 research D1). Unlike the
// in-memory SandboxSupplyEngine the other sandbox adapters share, there is no
// external supplier to simulate here — v0's "storage" IS Postgres (INV-025:
// "binaries live in Postgres-derived tables/CDN via packages/db"), so this
// adapter talks to the database directly. A later real object-storage/CDN
// adapter can implement the same MediaStorePort without touching callers.
import { desc, eq, mediaAsset, scopedWhere, type Db } from "@tripforge/db";
import type {
  MediaAsset,
  MediaSource,
  MediaStorePort,
  RegisterMediaInput,
  RegisterMediaOutcome,
} from "../ports/media-store.js";

const VALID_SOURCES: ReadonlySet<string> = new Set<MediaSource>([
  "licensed-stock",
  "official-embed",
  "agent-upload",
  "traveler-ugc",
]);

function toAsset(row: typeof mediaAsset.$inferSelect): MediaAsset {
  return {
    id: row.id,
    agencyId: row.agencyId,
    source: row.source as MediaSource,
    kind: row.kind as MediaAsset["kind"],
    url: row.url,
    alt: row.alt,
    ...(row.attribution !== null ? { attribution: row.attribution } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export class SandboxMediaStoreAdapter implements MediaStorePort {
  /**
   * `db` is optional at construction, matching `Container.db`'s own
   * optionality (pure RBAC/logic test containers carry no database) — the
   * requirement is enforced at call time, same pattern as
   * `services/client-view.ts`'s `if (!db) throw ...` guard.
   */
  constructor(private readonly db: Db | undefined) {}

  private requireDb(): Db {
    if (!this.db) throw new Error("database not configured");
    return this.db;
  }

  /**
   * Defense-in-depth: the tRPC boundary already rejects an invalid `source`
   * via Zod before this is called, but the port's own contract (research D1)
   * promises a typed refusal regardless of caller — never trust the boundary
   * alone for a closed enum this consequential (Compliance & Content
   * Sourcing).
   */
  async register(input: RegisterMediaInput): Promise<RegisterMediaOutcome> {
    if (!VALID_SOURCES.has(input.source)) {
      return { status: "refused", reason: "invalid_source" };
    }
    const rows = await this.requireDb()
      .insert(mediaAsset)
      .values({
        agencyId: input.agencyId,
        source: input.source,
        kind: input.kind,
        url: input.url,
        alt: input.alt,
        attribution: input.attribution ?? null,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("media asset insert returned no row");
    return { status: "registered", asset: toAsset(row) };
  }

  async list(agencyId: string): Promise<MediaAsset[]> {
    const rows = await this.requireDb()
      .select()
      .from(mediaAsset)
      .where(scopedWhere(mediaAsset.agencyId, agencyId))
      .orderBy(desc(mediaAsset.createdAt));
    return rows.map(toAsset);
  }

  async get(agencyId: string, mediaAssetId: string): Promise<MediaAsset | null> {
    const rows = await this.requireDb()
      .select()
      .from(mediaAsset)
      .where(scopedWhere(mediaAsset.agencyId, agencyId, eq(mediaAsset.id, mediaAssetId)))
      .limit(1);
    const row = rows[0];
    return row ? toAsset(row) : null;
  }
}
