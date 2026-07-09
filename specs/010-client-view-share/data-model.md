# Data Model: Client-View UI — Shared Itinerary (spec 010)

Phase 1 output. Entities, the redacted projection, and validation rules. Decisions
referenced from [research.md](./research.md).

## 1. `itinerary_share_link` (new table — packages/db/src/schema.ts)

Tenant-owned leaf table (INV-004). One durable link per itinerary (D9). **Not** a
canonical-itinerary-schema change: the jsonb document and its versioned shape are
untouched.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `token` | uuid | PK, `default gen_random_uuid()` | THE share secret (D1, ≥120 bits — FR-003) |
| `agency_id` | text | NOT NULL → `organization.id`, cascade | owning tenant (INV-004) |
| `itinerary_id` | uuid | NOT NULL, **UNIQUE** → `itinerary.id`, cascade | uniqueness = one durable link (FR-004); cascade makes deleted-itinerary links vanish (unknown-token behavior) |
| `created_at` | timestamp | NOT NULL default now() | audit |

**State transitions**: create-only at v0 (no revoke/expiry — spec Assumptions;
UNIQUE is droppable later without data loss if multi-link/revocation ships).

**Race rule (FR-004/SC-006)**: concurrent `share` calls both
`INSERT … ON CONFLICT (itinerary_id) DO NOTHING` then SELECT — the constraint decides;
both callers converge on the surviving row's token.

## 2. `ClientItineraryView` (projection type — packages/api/src/services/client-view.ts)

The ONLY shape the client surface is served (D2 — allowlist by construction; FR-007).
Money values are the server's exact integers; single currency guaranteed upstream by
the canonical schema's currency refinement.

```
ClientItineraryView
├── title            string        — itinerary title
├── agencyName       string        — the brand carrier (FR-006)
├── currency         string        — ISO-4217, applies to all *_Minor fields
├── totalSellMinor   number | null — server-side addMoney fold of item sell prices;
│                                    null when no item is priced (D8)
└── days[]           ordered by dayNumber
    ├── dayNumber    number
    ├── date         string | undefined   — ISO date when scheduled
    └── items[]
        ├── kind             "stay" | "activity" | "transfer"
        ├── title            string
        ├── booked           boolean       — item has a booking_component row (D6, FR-009)
        ├── sellMinor        number | null — sellPrice.amountMinor when priced (FR-008)
        └── schedule facts (kind-dependent, from the document — FR-008):
            stay:     checkIn string, checkOut string, adults number, children number
            activity: startsAt string?, durationMinutes number?
            transfer: from string, to string, mode string
```

**Excluded by construction** (agent-confidential / internal — FR-007, SC-003):
`pricing.netRate` (per item), `supplyRef` (port + external id), the itinerary
`pricing` block (budgetMode, budget total, category allocations/spend), `tripRequest`,
`provenance` (author/license/revenue-share/lineage — also the reseller's white-label
protection), `agencyId`, `schemaVersion`, document/item/day ids, `media` (empty at
v0; future allowlisting requires its own review), quote/hold data (never traveler
facing).

## 3. Typed outcomes (service layer)

| Operation | Outcome |
|-----------|---------|
| `createShareLink(container, agentSession, itineraryId)` | `{ status: "shared"; token: string; path: "/view/{token}" }` — or throws tRPC `NOT_FOUND` when the itinerary is absent **or owned by another agency** (identical shape, no existence oracle — FR-002) |
| `resolveShareLink(container, token)` | `{ status: "found"; view: ClientItineraryView }` \| `{ status: "not_found" }` — typed value, never an error (friendly unavailable state, FR-003) |
| `toClientItineraryView(document, agencyName, bookedItemIds)` | pure; total = fold(`addMoney`) over priced items (D8) |

## 4. Validation rules

- `share` input: `{ itineraryId: z.uuid() }` (strict object) — agentProcedure supplies
  tenancy (INV-023/004).
- `clientView.itinerary` input: `{ token: z.uuid() }` (strict object). The page treats
  a non-uuid path segment as `not_found` WITHOUT calling the procedure (D11).
- Ownership check for `share`: itinerary row must exist AND match
  `session.agencyId` — one scoped query (`scopedWhere` precedent), NOT_FOUND
  otherwise.
- The stored document is `parseItinerary`-validated at the api boundary on read
  (existing invariant INV-001) before projection.

## 5. Display mapping (page — presentation only)

| View field | Rendering |
|------------|-----------|
| `agencyName` | header brand line + `<title>` `"{title} — {agencyName}"` (INV-020) |
| `totalSellMinor` | `formatMinorAmount` (existing helper) — omitted when null |
| `items[].sellMinor` | `formatMinorAmount`; unpriced items render no price (US1/AS4) |
| `items[].booked` | "Booked" badge (`.tf-client-booked`), absent otherwise |
| empty `days` / empty `items` | "unplanned day" empty-state copy; never an error |
| unknown token / invalid token | neutral unavailable state, HTTP 200 page, no oracle |
