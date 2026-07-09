# Contracts: Client-View Share (spec 010)

Consumed/exposed API contracts + page rendering contract. Types are illustrative —
the browser and server-page callers use router **inference** (`inferRouterOutputs`),
never hand-copied shapes (spec 008/009 precedent).

## §1 `workspace.itinerary.share` (NEW mutation — agent-gated)

- **Procedure**: `agentProcedure` on the workspace itinerary router (INV-023/024).
- **Input** (strict): `{ itineraryId: string /* uuid */ }`
- **Success**: `{ status: "shared"; token: string /* uuid */; path: string /* "/view/{token}" */ }`
  - Idempotent per itinerary: repeat and concurrent calls return the SAME token
    (FR-004/SC-006; UNIQUE(itinerary_id) decides races — research D9).
  - Returns a **path**, never an absolute URL (origin is the browser's — research D5).
- **Failures**:
  - anonymous → tRPC `UNAUTHORIZED` (middleware)
  - authenticated non-agent → tRPC `FORBIDDEN` (middleware)
  - itinerary unknown **or owned by another agency** → tRPC `NOT_FOUND`
    (identical either way — FR-002, no existence oracle)

## §2 `clientView.itinerary` (NEW public query)

- **Procedure**: `publicProcedure` on a NEW top-level `clientView` router (INV-018:
  same surface mobile consumes later). No session read at all.
- **Input** (strict): `{ token: string /* uuid */ }`
- **Output** (typed union — never throws for business outcomes):
  - `{ status: "not_found" }` — unknown token, deleted itinerary; nothing else leaks
  - `{ status: "found"; view: ClientItineraryView }` — see
    [data-model.md §2](../data-model.md); allowlist projection, confidential fields
    structurally absent (FR-007)

## §3 Page contract — `/view/[token]` (server component)

| Concern | Contract |
|---------|----------|
| Data source | `clientView.itinerary` via server-side caller (no self-HTTP; research D3) |
| Invalid token format | render not-found state WITHOUT calling the procedure |
| Metadata | `generateMetadata`: title `"{trip title} — {agencyName}"`, neutral description, `robots: noindex` — platform naming FORBIDDEN in title/description (INV-020) |
| Caching | `dynamic = "force-dynamic"`; per-request `cache()` dedupe between metadata + page render |
| Branding | agency name in header + title; NO TripForge/Trellis anywhere; NO workspace affordances (INV-024) for any session state |
| Prices | `formatMinorAmount` display formatting of server integers ONLY (FR-008) |
| Booked mark | render iff `item.booked === true` (FR-009) |
| Empty states | unknown token → neutral unavailable card; empty days/items → "unplanned" copy |
| Existing `/view` (tokenless) | byte-untouched — trust-boundary + smoke e2e pin it |

## §4 Share control contract — workspace planner drafted state

| Concern | Contract |
|---------|----------|
| Placement | inside the drafted state only (spec 009 BookingFlow precedent) — never rendered for non-agents |
| Action | one click → `workspace.itinerary.share` → absolute URL = `new URL(path, location.origin)` |
| Re-share | shows the same URL (server idempotency); no client-side memory needed |
| Copy | clipboard write with visible confirmation; URL always shown as selectable text fallback |
| Errors | transport/authz mapped via existing `transport-error.ts` strings; typed failures impossible (share has none — errors only) |
| Money | none — this control renders no prices |

## §5 Live smoke additions (tests/integration/smoke.mjs)

1. Agent session shares the drafted itinerary → expect `status: "shared"` + uuid token.
2. Re-share → SAME token (FR-004).
3. Anonymous (cookie-less) `clientView.itinerary` with the token → `found`; assert
   payload contains agency name + a `sellMinor`, and does NOT contain the strings
   `netRate`, `netMinor`, `markup`, `supplyRef`, `provenance`, `budgetMode`,
   `tripRequest` (SC-003 payload scan).
4. Anonymous fetch of `/view/{token}` → HTTP 200, body contains agency name and NO
   `TripForge`/`Trellis` (INV-020).
5. Unknown random token → `not_found` + page renders unavailable state (200, no oracle).
