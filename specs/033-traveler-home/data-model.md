# Data Model: Traveler Home

**No new entities. No schema change. No migration.**

This feature is read-only UI over already-shipped projections:

| Entity (reused) | Source | Used for |
|---|---|---|
| `TravelerIdentity { name, email }` | `clientView.me` (spec 030, `packages/api/src/services/client-view.ts`) | Greeting the signed-in traveler by name |
| `TravelerTripSummary[]` | `clientView.myTrips` (spec 031, batched per perf-031) | "My Trips" count + link target `/view/my-trips` |
| `SessionContext { userId; agencyId?; agencyRole? }` | `getSessionContext` (`apps/web/lib/auth.ts`) | Branch anonymous welcome vs. signed-in home; a traveler has `userId` only (no `agencyId`) |

The canonical `Itinerary` document and `SCHEMA_VERSION` are untouched. No `packages/db` schema
file changes; no `drizzle` migration is generated or required (INV: canonical schema changes need a
versioned migration note — none applies because nothing changes).
