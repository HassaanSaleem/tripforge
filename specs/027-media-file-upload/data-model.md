# Data Model: Media library real file upload

## `media_asset` (existing table, extended additively)

Two new **nullable** columns; every existing row (URL-registered) keeps them
`NULL` and behaves exactly as before.

| Column         | Type      | Notes                                                            |
|----------------|-----------|-------------------------------------------------------------------|
| `data_base64`  | `text`, nullable | Present only for uploaded assets; the file's bytes, base64-encoded. `NULL` for URL-registered assets. |
| `mime_type`    | `text`, nullable | Present only for uploaded assets; one of the closed image MIME allowlist. `NULL` for URL-registered assets. |

No index needed on either column — both are only ever read by primary-key
lookup (`getBytesById`), never filtered/sorted on.

**Invariant**: exactly one of `(url present, data_base64+mime_type present)`
holds for any row — an asset is either URL-registered or upload-backed, never
both, never neither. Enforced at the adapter (`register` never sets the new
columns; `upload` never sets `url` directly — it's derived).

## `MediaAsset` (port-level shape, `packages/supply-adapter`)

**Unchanged public shape** — `id`, `agencyId`, `source`, `kind`, `url`,
`alt`, `attribution?`, `createdAt`. For an upload-backed asset, `url` is
computed by the adapter at read time as an ABSOLUTE url,
`{publicBaseUrl}/api/media/{id}` (never stored literally — research D6:
`MediaRefSchema.url` requires `z.string().url()`, so a bare path fails
`ItinerarySchema.parse` once attached) — from every existing caller's
perspective (attach/detach, gallery rendering, client-view projection) an
upload-backed `MediaAsset` is
byte-for-byte indistinguishable from a URL-registered one (spec FR-006).

## New port types (`packages/supply-adapter/src/ports/media-store.ts`)

```ts
export interface UploadMediaInput {
  agencyId: string;
  source: MediaSource;
  kind: "image"; // v0 upload is image-only
  alt: string;
  attribution?: string;
  mimeType: string;   // must be one of the closed image MIME allowlist
  data: Uint8Array;   // raw bytes; the adapter owns base64 encoding internally
}

export type UploadMediaOutcome =
  | { status: "uploaded"; asset: MediaAsset }
  | { status: "refused"; reason: "invalid_source" | "invalid_mime_type" | "file_too_large" };

export interface MediaBytes {
  mimeType: string;
  data: Uint8Array;
}
```

`MediaStorePort` gains:
```ts
upload(input: UploadMediaInput): Promise<UploadMediaOutcome>;
getBytesById(mediaAssetId: string): Promise<MediaBytes | null>; // NOT tenant-scoped — see research D3
```

No canonical itinerary schema change — `MediaRef` (v0.1.0) already accepts
either `storageKey` or `url`; this feature continues to populate `url` only
(the internal serving path), matching v0's existing shape exactly.
