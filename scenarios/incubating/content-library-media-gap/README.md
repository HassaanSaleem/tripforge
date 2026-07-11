# Content-library media-gap scenario (T3 Frontier, iteration 3 second pass)

The PRD's Pillar-1 promise — "attach content from the media library and preview
the branded client-facing view" — has no product surface yet: the canonical
schema carries a complete `MediaRef` model (closed licensed-only `source` enum,
D-006.c; itinerary-level gallery + per-item media), but there is no attach API,
no library UI, and the client-view projection strips `media` by allowlist.

This scenario **verifies the gap and pins today's behavior** of every existing
path for media-bearing canonical documents, live against the built compose
stack (20 checks, all expected green):

1. **No hidden affordance** — `workspace.itinerary.draft` refuses a `media`
   key typed (strict input) and persists nothing.
2. **Dormant schema** — fresh drafts round-trip `media: []` at gallery and
   item level, agent-readable via `workspace.itinerary.get`.
3. **Valid media-bearing documents** (arranged operator-side via psql — the
   deliberate absence of a product path IS the gap) flow through agent get,
   share-link mint, public `clientView.itinerary`, and the `/view` SSR page
   without breaking.
4. **The traveler trust boundary holds** — client-view payload and page are
   structurally free of media keys and sentinel values. A client-facing
   gallery therefore needs a deliberate projection-allowlist decision (spec
   010 FR-007), not just an attach UI.
5. **Marketplace propagation (the rights question)** — licensing a
   media-bearing listing copies the gallery VERBATIM into the white-label
   copy, including `agent-upload` attribution naming the ORIGINAL agency.
   The check pins the factual behavior; whether copies SHOULD inherit media
   (license terms for content, attribution on resale) is an open product
   question in the iteration report — do not read the green check as an
   endorsement.
6. **Closed-enum enforcement on read (INV-001/D-006.c)** — a document whose
   media `source` is `"scraped-web"` is refused by every surface: agent get
   errors, public clientView never serves the scraped sentinel, `/view` never
   renders it. Known friction (report): all three refusals are raw 500s, not
   typed unavailable states.

## Run

```bash
docker compose up --build --wait
BASE_URL=http://localhost:3000 node scenarios/incubating/content-library-media-gap/scenario.mjs
```

Exit 0 = every pinned behavior holds. Uses `docker compose exec postgres psql`
for the operator-side arrangements (vetting + media injection), the same
pattern as `tests/e2e/support.ts` and the golden-path scenario.
