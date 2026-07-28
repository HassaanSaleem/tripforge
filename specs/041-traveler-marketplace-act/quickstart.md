# Quickstart / Validation: Traveler acts on a marketplace itinerary

Proves the feature end-to-end against the built compose stack (INV-027) and via L3.

## Prerequisites

- `docker compose down -v && docker compose up --build --wait` (fresh stack; keyless FakeLLM is
  fine — the fork/book path is deterministic and does not need the LLM).
- Seed data provides at least one **vetted** agency with an **active** marketplace listing, and a
  traveler account (or sign one up in-flow). If needed, list a trip from the agent workspace
  marketplace first (`/marketplace` → list) and vet the agency
  (`packages/db/scripts/vet-agency.mjs`).

## Manual browser journey (QA / UAT)

1. Sign in as a traveler at `/view/sign-in` (or sign up at `/view/sign-up`).
2. Open `/view/marketplace`. **Expect**: real listing cards (title, agency name, verified badge,
   a "from" price) — NOT the "coming soon" placeholder.
3. Inspect one card's network payload (`clientView.marketplace.browse`). **Expect**: no
   `priceMinor` (license price), `revenueShareBps`, `licenseTerms`, net, or markup fields.
4. Click "Plan & book this trip" on a card. **Expect**: land on `/view/[token]` for a NEW copy;
   the trip appears in `/view/my-trips`.
5. Choose "Book it myself" → review → confirm. **Expect**: booked legs show a client price; the
   total reflects the **seller's** markup (not a flat default) if the source trip was quoted.
6. (Alt) From the copy choose "Have an agent arrange this" and submit. Then, as the SELLER
   agent, open `/trip-requests`. **Expect**: the handoff request appears for the seller agency.
7. Re-open `/view/marketplace` as a *second* traveler and fork the SAME listing. **Expect**: a
   fresh, fully-bookable copy unaffected by traveler 1's booking; the listing still shows.

## L3 money-path validation (the unbeatable test)

`packages/api/src/__tests__/l3-traveler-marketplace-fork.test.ts` on real Postgres asserts:

- **Seller-markup pricing (FR-010)**: fork a listing whose source trip was quoted at markup M
  (M ≠ default); self-book the copy; assert each booked leg's `sell = net × (1 + M)` and a
  `markup_ledger` row records the seller's margin under the **seller** agency id.
- **Default-never-zero (FR-011)**: fork a listing whose source was never quoted; self-book;
  assert the platform-default markup applies (traveler never pays net).
- **Conservation on failure (FR-012, INV-011)**: force one component's hold to fail; assert the
  failed leg is not charged, the others book, and no orphan booking/markup rows exist.
- **Seller attribution (SC-005, INV-004)**: every `booking` / `booking_component` /
  `markup_ledger` row written carries `seller_agency_id`.
- **Independence (SC-004)**: two forks of one listing produce two distinct copies; booking one
  leaves the other fully bookable and the listing unchanged.
- **Redaction (FR-013, INV-020)**: the self-book outcome and browse card contain no net/markup/
  MoR/supplierRef; assert the browse projection's key set.
- **Refusal (FR-009)**: fork an inactive listing → `not_available`, zero rows written.

## Commands

```bash
# In-image unit/L1-L3 + lint (loop runs these inside the built image)
pnpm test
pnpm run lint

# L3 focused
pnpm --filter @tripforge/api test -- l3-traveler-marketplace-fork

# e2e journey against the live stack
npx playwright test tests/e2e/traveler-marketplace-journey.spec.ts
```

## Expected outcomes (pass criteria)

- Browse renders active listings with client-safe fields only.
- Fork creates a seller-owned copy + share link + "My Trips" link + `marketplace_fork` row.
- Self-book charges the seller's sell price, records `markup_ledger`, conserves on failure.
- Request-agent routes to the seller.
- Zero non-allowlisted ERROR lines in the compose logs.
