# Phase 1 Data Model: Discover / "What's Hot" Feed

All entities in this feature are static, in-repo TypeScript data (`apps/web/lib/discover-feed.ts`) — no database tables, no migrations, no itinerary-schema changes.

## Featured Destination (existing — reused, not modified)

Already defined as `HeroDestination` in `apps/web/lib/planner-form.ts` (`HERO_DESTINATIONS`). Discover reuses this list unchanged for its destination picker:

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | `"lisbon"` \| `"tokyo"` \| `"marrakech"` \| `"reykjavik"` — join key for feed items |
| `city` | `string` | Display name |
| `country` | `string` | Display name |
| `flag` | `string` | Emoji |
| `gradient` | `string` | CSS gradient (used elsewhere; Discover's own cards use a photo, not this gradient) |

## What's-Hot Feed Item (new)

```ts
interface DiscoverFeedItem {
  id: string;                 // stable slug, e.g. "lisbon-alfama-walking-tour"
  destinationId: HeroDestination["id"]; // FK-by-convention to HERO_DESTINATIONS
  title: string;               // e.g. "Alfama Old Town Walking Tour"
  blurb: string;                // "what's happening" short description
  image: {
    url: string;                // images.unsplash.com / plus.unsplash.com CDN URL
    alt: string;                 // accessibility text
    attribution: string;         // "Photo by X on Unsplash"
    source: "licensed-stock";     // matches MediaSourceSchema vocabulary (packages/itinerary-schema/src/media.ts)
  };
  hotelHighlight: {
    name: string;                // e.g. "Palácio da Baixa"
    description: string;         // one-line description
  };
  planDestination: string;      // exact value to pre-seed the builder with — "${city}, ${country}" format matching HERO_DESTINATIONS
}
```

**Validation rules** (enforced by an L1 unit test over the static data, not runtime validation — this is compile-time-authored content, not user input):

- Every `HERO_DESTINATIONS` entry MUST have at least 3 associated `DiscoverFeedItem`s (spec SC-004).
- `title`, `blurb`, `image.url`, `image.alt`, `image.attribution`, `hotelHighlight.name`, `hotelHighlight.description`, and `planDestination` MUST all be non-empty strings.
- `image.source` is always the literal `"licensed-stock"` — no other `MediaSourceSchema` member is applicable to this static curated content (no UGC, no official embeds in this cycle).
- `planDestination` MUST exactly equal `"${city}, ${country}"` for the item's `destinationId`'s `HeroDestination`, so a "Plan this" tap produces the identical value the manual destination picker would.
- `id` MUST be unique across the whole feed set.

**No state transitions** — this is static, non-user-mutable content for this cycle (per spec Assumptions).

## Hotel Highlight

Modeled as an embedded field of `DiscoverFeedItem` (see above), not a standalone top-level entity — each feed item carries exactly one associated hotel recommendation for its destination. This keeps each card self-contained (one place/experience + one nearby stay suggestion) rather than requiring a separate hotel-highlight fetch/join at render time.
