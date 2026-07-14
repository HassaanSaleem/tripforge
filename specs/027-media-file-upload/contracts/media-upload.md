# Contract: Media library real file upload (seed-0022a)

## §1. `workspace.media.upload` (mutation, new)

**Input**:
```ts
{ source: "licensed-stock" | "official-embed" | "agent-upload" | "traveler-ugc";
  kind: "image";
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  dataBase64: string;   // base64-encoded file bytes; decoded length MUST be <= 3 MB
  alt: string;           // min length 1
  attribution?: string; }
```

**Output**:
```ts
| { status: "uploaded"; asset: MediaAsset }
| { status: "refused"; reason: "invalid_source" | "invalid_mime_type" | "file_too_large" }
```

**Contract**:
- Persists a row scoped to `session.agencyId` (the caller supplies no tenant
  id) — identical tenancy guarantee to `workspace.media.register`.
- `mimeType` outside the closed image allowlist is refused
  (`invalid_mime_type`) before any bytes are decoded or persisted.
- A decoded byte length over 3 MB is refused (`file_too_large`) before any
  row is written — checked on the DECODED length, not the base64 string
  length (base64 inflates ~4/3×).
- `source` outside the closed set is a Zod input-validation error at the
  tRPC boundary (TRPCError `BAD_REQUEST`), same belt-and-suspenders pattern
  as `register`.
- The returned `MediaAsset.url` is the internal serving path (`/api/media/{id}`)
  — indistinguishable in shape from a `register`-produced asset to every
  existing caller (attach/detach, gallery rendering, client-view projection).

## §2. `GET /api/media/[id]` (new Next.js Route Handler, public)

**Input**: `id` — the media asset's uuid, from the URL path.

**Output**:
- `200` with `Content-Type: <stored mime_type>` and the raw decoded bytes, for
  an upload-backed asset that exists.
- `404` (empty body) for: an unknown id, a URL-registered asset (no bytes to
  serve — those render via their own external `url`, never this route), or
  any id from another tenant queried directly (there is no tenant scoping
  because there is no session — same trust model as the client-view share
  link's `resolveShareLink`, see research D3).

**Contract**:
- No session is read; possession of the asset's own unguessable random uuid
  is the read grant — this route MUST be reachable from a signed-out
  browser context (the public client-view share page renders `<img>` tags
  pointing at it).
- MUST NOT leak `agencyId`, `source`, or `attribution` in any response
  header or body — only bytes and a content type cross this boundary
  (INV-020 in spirit, matching the existing client-view media allowlist).

## Tenant scoping

`workspace.media.upload` runs under `agentProcedure` — `session.agencyId` is
always server-derived, never client-supplied, matching every other
`workspace.media.*` procedure. `GET /api/media/[id]` is deliberately public
(§2) — this is the ONE new surface in this feature that is not
tenant-scoped, and it is scoped instead by unguessable-id possession, the
same model the client-view share link already uses for the whole itinerary.
