# Data Model: Content Library v0

## New table: `media_asset`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, default random | Library asset id — also used as `MediaRef.id` when attached (research D4) |
| `agency_id` | `text` NOT NULL, FK → `organization.id`, cascade | Tenant scope (INV-004), mirrors `agencyFk()` convention |
| `source` | `text` NOT NULL | Closed enum, application-enforced: `licensed-stock`\|`official-embed`\|`agent-upload`\|`traveler-ugc` (reuses `@tripforge/itinerary-schema` `MediaSourceSchema` at the boundary) |
| `kind` | `text` NOT NULL | `image`\|`video`\|`embed` |
| `url` | `text` NOT NULL | Servable reference; v0 has no `storage_key` column — URL-registration only (research D2) |
| `alt` | `text` NOT NULL | Accessibility + the only description that ever reaches a client |
| `attribution` | `text` NULL | Agent-facing only; never projected to client-view (research D5) |
| `created_at` | `timestamp` NOT NULL, default now | |

Index: `media_asset_agency_idx` on `(agency_id)` (list-by-agency is the only
query pattern, mirrors `itinerary_agency_idx`).

No migration note beyond this new table — the canonical itinerary schema
(Constitution IV) is unchanged; `MediaRefSchema` already existed at
`SCHEMA_VERSION = "0.1.0"`.

## Extended: `Itinerary.media[]` / `Item.media[]` (canonical schema, unchanged shape)

Populated for the first time by this feature via `attachMedia`/`detachMedia`
(research D3). No schema field added — `MediaRefSchema` already defines:

| Field | Type | Populated how |
|---|---|---|
| `id` | string | = the `media_asset.id` of the attached asset (research D4) |
| `kind` | `image`\|`video`\|`embed` | copied from the `media_asset` row |
| `url` | string (optional in schema, always set here) | copied from the `media_asset` row |
| `source` | closed enum | copied from the `media_asset` row |
| `alt` | string | copied from the `media_asset` row |
| `attribution` | string, optional | copied from the `media_asset` row |

`storageKey` is never set in v0 (URL-registration only, research D2) — the
schema's `refine` (storageKey OR url required) is satisfied by `url` alone.

## Computed (not persisted): `ClientViewMedia`

| Field | Type | Source |
|---|---|---|
| `kind` | `image`\|`video`\|`embed` | `MediaRef.kind` |
| `url` | string | `MediaRef.url` |
| `alt` | string | `MediaRef.alt` |

Deliberately excludes `id`, `source`, `attribution` (research D5, FR-010).
`ClientItineraryView.media` (gallery) and each `ClientViewItem.media`
(per-item) are both arrays of this type, mapped directly off the loaded
canonical document — no new query.

## Relationships

```
media_asset (agency-owned, independent)
     │ id  (referenced, never FK-constrained — the document is JSONB)
     ▼
itinerary.document.media[]            (gallery, MediaRef[])
itinerary.document.days[].items[].media[]   (per-item, MediaRef[])
     │
     ▼ (toClientItineraryView projection, research D5)
ClientItineraryView.media[]           (gallery, ClientViewMedia[])
ClientViewItem.media[]                (per-item, ClientViewMedia[])
```

A `media_asset` row has no foreign key from the itinerary document (the
document is JSONB, referencing by opaque `id` string, same pattern as
`supplyRef.externalId`) — detaching everywhere does not delete the
`media_asset` row, and deleting a `media_asset` (not in scope for this
feature — no delete endpoint) would leave a dangling reference, same
class of risk the schema already accepts for `supplyRef` today.

## State transitions

- `media_asset`: created (register) → read (list/get). No update, no delete
  in v0 (not in spec scope).
- `MediaRef` attachment: absent → attached (attach) → absent (detach), scoped
  per `(target, id)` pair. Independent per target — the same asset can be
  attached/detached from the gallery and from N items independently.
