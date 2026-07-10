# Scenario: golden-path-trade-live (Kitchen Loop iteration 3, T2)

The PRD's "typical user session" as one composed journey against the **live**
stack, plus the resale hop the marketplace copy advertises: an agent-seller
drafts a Paris trip with the AI planner, quotes and books all components at a
**custom 18% markup** (the e2e journeys only exercise the 1500-bps default),
lists the finished trip with declared terms (fee 250.00 USD, revenue share
7.5%, license terms); an agent-reseller licenses it; the reseller **re-lists
the white-label copy** (fee 400.00 USD, 5%); a third agency licenses the
resale. Features composed: itinerary-builder + booking + marketplace +
revenue-share, web+api, agent-seller + agent-reseller.

Vetting is a platform-operator action (spec 011 research D10) — like
`tests/e2e/support.ts`, the script performs the operator's half directly
against compose Postgres.

## Run

```bash
docker compose up --build --wait
BASE_URL=http://localhost:3000 node scenarios/incubating/golden-path-trade-live/scenario.mjs
```

State-delta assertions ride the platform's own integers: markup-ledger
conservation (`net + markup = sell` on every booked component, FX-converted
nets included), license-split conservation at the fixed 10% platform take
(`price = platform_take + seller_credit`, both trades), the seed-0006b FR-014
PMF event split, declared `revenue_share_bps` stored verbatim (750 — the
seed-0009d-b reversion probe), and the provenance stamped into each
white-label copy (licensed-under terms + full `rebrandLineage` +
`originalAuthorAgencyId` across two generations).

## Known-failing assertion (intentional — pins an open bug)

`KNOWN-BUG copy provenance still records the licensed-under terms after
re-list` FAILS as of 2026-07-10 (iteration-3 report BUG-1): re-listing a
licensed copy OVERWRITES the copy's provenance in place — `revenueShareBps`
750 → 500 and the seller's license terms are replaced by the reseller's own —
erasing the platform's stamp of the terms the copy was licensed under
(Constitution VI provenance integrity). License-time stamping itself is
correct (proven green by the same run). The assertion stays red until the
product is fixed. Do not weaken it.

## Not asserted (operator decision pending)

The resale split pays the original seller **nothing** (40000 → 4000 platform +
36000 reseller; the declared 7.5% drives no money) while the marketplace UI
promises "earn a share on every resale". Whether v0 resale must pay the
upstream share in money or provenance-stamping suffices is a
revenue-share-semantics question the loop may not decide (DIRECTIVE
ALWAYS-HALT) — see OPERATOR-DESK row RESALE-SHARE-SEMANTICS. The script logs
the observation (`note upstream-share observation:`) without asserting either
semantic.
