// Postgres-backed media library adapter (spec 015 research D1; spec 027
// research D1/D5: real upload). Unlike the in-memory SandboxSupplyEngine the
// other sandbox adapters share, there is no external supplier to simulate
// here — storage IS Postgres, both for URL-registered metadata and (spec
// 027) for uploaded bytes, base64-encoded into the same tenant-scoped
// derived table (INV-003 — no second datastore). A later real
// object-storage/CDN adapter can implement the same MediaStorePort without
// touching callers.
import { desc, eq, mediaAsset, scopedWhere, type Db } from "@tripforge/db";
import type {
  MediaAsset,
  MediaBytes,
  MediaSource,
  MediaStorePort,
  RegisterMediaInput,
  RegisterMediaOutcome,
  UploadMediaInput,
  UploadMediaOutcome,
  UploadMimeType,
} from "../ports/media-store.js";

const VALID_SOURCES: ReadonlySet<string> = new Set<MediaSource>([
  "licensed-stock",
  "official-embed",
  "agent-upload",
  "traveler-ugc",
]);

const VALID_UPLOAD_MIME_TYPES: ReadonlySet<string> = new Set<UploadMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** 3 MB raw-byte cap (spec 027 research D4) — chosen for the base64-over-tRPC
 * transport (~4/3x inflation) plus the Vercel P0 deploy target's serverless
 * request-body ceiling (ADR-0004), not just what passes local Live Test. */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/**
 * Magic-byte signature check (pr-auditor defense-in-depth follow-up to PR
 * #72) — `input.mimeType` is a caller-supplied claim (the browser's
 * `File.type`), never trustworthy on its own for what gets persisted and
 * later served back with that same Content-Type. Verify the declared type
 * against the file's actual leading bytes so a payload mislabeled as (say)
 * `image/png` while carrying different content is rejected server-side
 * regardless of caller. `Record<UploadMimeType, ...>` makes this exhaustive
 * by construction — the compiler forces a new entry the day the closed
 * allowlist above ever grows.
 */
const MAGIC_BYTE_CHECKS: Record<UploadMimeType, (data: Uint8Array) => boolean> = {
  "image/jpeg": (data) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  "image/png": (data) =>
    data.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => data[i] === byte),
  "image/gif": (data) =>
    data.length >= 6 &&
    [0x47, 0x49, 0x46, 0x38].every((byte, i) => data[i] === byte) &&
    (data[4] === 0x37 || data[4] === 0x39) &&
    data[5] === 0x61,
  "image/webp": (data) =>
    data.length >= 12 &&
    [0x52, 0x49, 0x46, 0x46].every((byte, i) => data[i] === byte) &&
    [0x57, 0x45, 0x42, 0x50].every((byte, i) => data[i + 8] === byte),
};

export class SandboxMediaStoreAdapter implements MediaStorePort {
  /**
   * `db` is optional at construction, matching `Container.db`'s own
   * optionality (pure RBAC/logic test containers carry no database) — the
   * requirement is enforced at call time, same pattern as
   * `services/client-view.ts`'s `if (!db) throw ...` guard.
   *
   * `publicBaseUrl` (spec 027 research D6): an upload-backed asset's `url`
   * must be a full, absolute URL — `MediaRefSchema.url` is `z.string().url()`
   * (canonical schema, shared with `register`'s externally-hosted urls), so a
   * bare path like `/api/media/{id}` fails `ItinerarySchema.parse` the moment
   * it's attached to an itinerary. Reuses the SAME origin concept as
   * `BETTER_AUTH_URL` (the app's one already-established "my own public
   * origin" env var) rather than inventing a second one — defaults to
   * `http://localhost:3000` to match that var's own default.
   */
  constructor(
    private readonly db: Db | undefined,
    private readonly publicBaseUrl: string = "http://localhost:3000",
  ) {}

  private requireDb(): Db {
    if (!this.db) throw new Error("database not configured");
    return this.db;
  }

  /** An upload-backed row has no stored `url` — its absolute servable url is
   * derived here, never persisted literally (data-model.md). */
  private toAsset(row: typeof mediaAsset.$inferSelect): MediaAsset {
    return {
      id: row.id,
      agencyId: row.agencyId,
      source: row.source as MediaSource,
      kind: row.kind as MediaAsset["kind"],
      url: row.url ?? `${this.publicBaseUrl}/api/media/${row.id}`,
      alt: row.alt,
      ...(row.attribution !== null ? { attribution: row.attribution } : {}),
      createdAt: row.createdAt.toISOString(),
    };
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
    return { status: "registered", asset: this.toAsset(row) };
  }

  /**
   * Real binary upload (spec 027 FR-001-005). Same defense-in-depth
   * discipline as `register`: the tRPC boundary validates `source`/`mimeType`
   * via Zod, this method validates again regardless of caller. The decoded
   * byte length — not the base64 string length — is what's checked against
   * the cap (spec 027 contracts §1).
   */
  async upload(input: UploadMediaInput): Promise<UploadMediaOutcome> {
    if (!VALID_SOURCES.has(input.source)) {
      return { status: "refused", reason: "invalid_source" };
    }
    if (!VALID_UPLOAD_MIME_TYPES.has(input.mimeType)) {
      return { status: "refused", reason: "invalid_mime_type" };
    }
    if (input.data.byteLength > MAX_UPLOAD_BYTES) {
      return { status: "refused", reason: "file_too_large" };
    }
    if (!MAGIC_BYTE_CHECKS[input.mimeType](input.data)) {
      return { status: "refused", reason: "mime_mismatch" };
    }
    const rows = await this.requireDb()
      .insert(mediaAsset)
      .values({
        agencyId: input.agencyId,
        source: input.source,
        kind: input.kind,
        url: null,
        alt: input.alt,
        attribution: input.attribution ?? null,
        dataBase64: Buffer.from(input.data).toString("base64"),
        mimeType: input.mimeType,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("media asset insert returned no row");
    return { status: "uploaded", asset: this.toAsset(row) };
  }

  async list(agencyId: string): Promise<MediaAsset[]> {
    const rows = await this.requireDb()
      .select()
      .from(mediaAsset)
      .where(scopedWhere(mediaAsset.agencyId, agencyId))
      .orderBy(desc(mediaAsset.createdAt));
    return rows.map((row) => this.toAsset(row));
  }

  async get(agencyId: string, mediaAssetId: string): Promise<MediaAsset | null> {
    const rows = await this.requireDb()
      .select()
      .from(mediaAsset)
      .where(scopedWhere(mediaAsset.agencyId, agencyId, eq(mediaAsset.id, mediaAssetId)))
      .limit(1);
    const row = rows[0];
    return row ? this.toAsset(row) : null;
  }

  /**
   * Deliberately NOT tenant-scoped (spec 027 research D3) — the public
   * client-view page has no session to scope by. Possession of the asset's
   * own random uuid is the read grant, the same trust model the client-view
   * share link already uses for the whole itinerary. Returns `null` for an
   * unknown id OR a URL-registered asset (nothing stored to serve).
   */
  async getBytesById(mediaAssetId: string): Promise<MediaBytes | null> {
    const rows = await this.requireDb()
      .select()
      .from(mediaAsset)
      .where(eq(mediaAsset.id, mediaAssetId))
      .limit(1);
    const row = rows[0];
    if (!row || !row.dataBase64 || !row.mimeType) return null;
    return { mimeType: row.mimeType, data: new Uint8Array(Buffer.from(row.dataBase64, "base64")) };
  }
}
