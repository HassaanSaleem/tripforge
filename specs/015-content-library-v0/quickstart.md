# Quickstart: Content Library v0 (spec 015)

Validation guide — proves the feature end-to-end against the BUILT compose
image (INV-027). Runs keyless: empty `ANTHROPIC_API_KEY` → deterministic
FakeLLM planner.

## Prerequisites

- Docker + compose; ports 3000/5432/8025 free
- Repo root; no host `node_modules` needed (hermetic image)

## 1. Boot the built stack

```bash
docker compose down -v && docker compose up --build --wait
```

Expect: all services healthy, exit 0.

## 2. Deterministic suites

```bash
docker compose exec web pnpm test
node tests/integration/smoke.mjs
npx playwright test
```

Expect: all green, including new `l3-media.test.ts` assertions (cross-tenant
refusal on register/list/get/attach/detach, closed-enum refusal, attach/
detach round-trip) and the extended `l3-client-view.test.ts` (no internal id/
source/attribution leak in the projected payload).

## 3. Manual browser journey (what the e2e automates)

1. `http://localhost:3000/sign-up` → create an agency, sign in.
2. Draft a trip (`/workspace`).
3. Open the media library panel: register a media item (`source:
   agent-upload`, a real public image URL, alt text) — it appears in the
   library list immediately, no reload.
4. Attach it to the itinerary's gallery — confirm it shows in the workspace
   preview.
5. Attach a (same or second) media item to one specific item (e.g. the
   hotel stay) — confirm it shows against that item only.
6. Share the itinerary and open the `/view/<token>` link in a fresh
   (unauthenticated) context: confirm the gallery image and the per-item
   image render with their alt text, and confirm — via view-source or
   devtools — that no internal media-asset id, `source` value, or
   `attribution` string appears anywhere on the page.
7. Back in the workspace, detach the gallery image — reload the itinerary:
   confirm it's gone from the gallery but the item-level attachment (step 5)
   is untouched, and the asset is still listed in the library.
8. Cross-tenant spot-check: sign up a second agency in a fresh context,
   confirm its media library is empty (does not show agency 1's assets), and
   confirm it cannot attach agency 1's media id to its own itinerary (typed
   refusal, no state change).

## 4. Log scan

```bash
docker compose logs --no-color > /tmp/compose.log
grep -nE "ERROR|FATAL|Unhandled" /tmp/compose.log   # expect: no non-allowlisted hits
```

Known-benign: one duplicate-key ERROR on `booking_component_itinerary_item_idx`
if the L3 booking race test ran against this DB (documented, allowlist
untouched).

## 5. Teardown

```bash
docker compose down -v
```

## References

- Contract: [contracts/media-library.md](./contracts/media-library.md)
- Data model: [data-model.md](./data-model.md)
- Decisions: [research.md](./research.md) (D1–D6)
