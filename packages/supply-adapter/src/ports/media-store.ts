// Agency media library port (spec 015: content library v0; spec 027: real
// upload, seed-0022a). Unlike the bookable-component ports
// (hotel/activity/transfer/car-rental), there is no quote-then-book lifecycle
// here — a media asset is registered or uploaded metadata, not an offer with
// a price hold (research D1: SupplyPort<Criteria,Offer,Quote> does not fit a
// storage repository, so this is a smaller, dedicated shape). v0 was
// URL-registration only (research D2); spec 027 adds `upload`, storing bytes
// in Postgres (the existing derived table) rather than a second datastore
// (INV-003) — see spec 027 research D1. `source` mirrors itinerary-schema's
// closed MediaSource enum — redeclared locally so this package stays
// independent of @tripforge/itinerary-schema (no existing port imports it).
export type MediaSource = "licensed-stock" | "official-embed" | "agent-upload" | "traveler-ugc";
export type MediaKind = "image" | "video" | "embed";
export type UploadMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface MediaAsset {
  id: string;
  agencyId: string;
  source: MediaSource;
  kind: MediaKind;
  url: string;
  alt: string;
  attribution?: string;
  createdAt: string; // ISO datetime
}

export interface RegisterMediaInput {
  agencyId: string;
  source: MediaSource;
  kind: MediaKind;
  url: string;
  alt: string;
  attribution?: string;
}

export type RegisterMediaOutcome =
  | { status: "registered"; asset: MediaAsset }
  | { status: "refused"; reason: "invalid_source" };

/** Raw-bytes upload input (spec 027 FR-001/002) — the adapter owns base64
 * encoding internally; callers never see the storage encoding. */
export interface UploadMediaInput {
  agencyId: string;
  source: MediaSource;
  kind: "image"; // v0 upload is image-only (spec 027 Assumptions)
  alt: string;
  attribution?: string;
  mimeType: UploadMimeType;
  data: Uint8Array;
}

export type UploadMediaOutcome =
  | { status: "uploaded"; asset: MediaAsset }
  | { status: "refused"; reason: "invalid_source" | "invalid_mime_type" | "file_too_large" | "mime_mismatch" };

/** The stored bytes behind an upload-backed asset, for the public serving
 * route (spec 027 contracts §2). */
export interface MediaBytes {
  mimeType: string;
  data: Uint8Array;
}

/**
 * The agency media library port. Handlers depend on THIS type, never a
 * concrete adapter class (clean-arch: "handlers depend on the port type").
 * `list`/`get`/`upload` are tenant-scoped by construction — every
 * implementation MUST filter by `agencyId`, never return another agency's
 * rows (INV-004). `getBytesById` is the ONE deliberate exception — it is
 * addressed only by the asset's own unguessable random id, mirroring the
 * client-view share-link's "possession of the token is the grant" model
 * (spec 027 research D3), because the public client-view page has no
 * session to scope by.
 */
export interface MediaStorePort {
  register(input: RegisterMediaInput): Promise<RegisterMediaOutcome>;
  upload(input: UploadMediaInput): Promise<UploadMediaOutcome>;
  list(agencyId: string): Promise<MediaAsset[]>;
  get(agencyId: string, mediaAssetId: string): Promise<MediaAsset | null>;
  getBytesById(mediaAssetId: string): Promise<MediaBytes | null>;
}
