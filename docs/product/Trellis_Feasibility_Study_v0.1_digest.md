# Trellis Feasibility Study v0.1 — Ingested Digest

Agent-readable digest of `docs/product/Trellis_Feasibility_Study_v0.1.pdf`
(Owner: Syed Hassaan Saleem · July 2026 · companion to the Charter & PRD v0.3).
The PDF is the source of truth; this digest exists so the loop's ideate/planning
phases can read the study's implications without parsing the PDF. Market/margin
figures are directional ranges from 2025–2026 sources — spot-check before
external use.

## Executive verdict
**Conditionally feasible — proceed to field validation.** Both demand-side
assumptions hold on independent 2025–26 data: AI trip-planning adoption is
accelerating (56% of US leisure travelers used AI for a trip by early 2026, up
from 43% ~9 months earlier), AND demand for human-accountable advisors is
*rising* — including among the youngest, most AI-fluent travelers (60% of Gen
Z/Millennials want an advisor). AI usage and advisor usage are **complements,
not substitutes** — this directly validates the PRD's self-drive-vs-request-agent
fork and the ~8% AI-booking trust ceiling.

## Two corrections to the current plan (the load-bearing findings)
1. **Monetization is mis-SEQUENCED, not mis-designed.** Lead fees, white-label
   fees, B2B promotions and ads only produce revenue once *consumer traffic*
   exists (Phase 2+). **Booking margin, marketplace take-rate, and light SaaS
   must carry P0–P1.** Dropping take-rate/SaaS in favor of leads+ads implies
   near-zero revenue for 18–24 months and no monetization signal from the agent
   side — the side whose willingness to pay is the entire wedge.
2. **Adjacent funded players are converging on the same square** (Fora US$78.2M
   raised; Mindtrip acquired Thatch Mar 2025; kimkim entered B2B advisor trade
   late 2025). The defensible asset is **marketplace liquidity in ONE beachhead
   niche** — *speed to liquidity beats breadth of positioning.*

## Recommended revenue sequencing (restores the PRD's original stack early)
| Phase | Revenue streams live | Status in code |
|---|---|---|
| **P0–P1** | Booking margin on net rates + marketplace take-rate + **light SaaS membership** (Fora proves US$299/yr clears; a Zicasso-style pay-on-transaction variant lowers the barrier) | markup ✅ built · take-rate ✅ built · **SaaS membership ✗ NOT built** |
| **P2** | Consumer→agent handoff fees (**pay-on-conversion**, per Zicasso/kimkim) + ancillaries (eSIM, insurance) | request-agent fork ✅ built (trip-handoffs, spec 022); *fee/billing* ✗ not built |
| **P3** | What's-Hot sponsored placements / travel-media network (labeled) + supplier promotions | Discover feed ✅ built; *sponsorship/ads* ✗ not built |

## Market size — layered (monetize flows, not seats)
- Online travel bookings **US$519B (2023) → US$1T+ by 2032 (~8% CAGR)** — the GBV pool the North Star draws from.
- Hotel wholesale/bedbank **~US$147B→US$211B (2026 proj.)**; wholesale ≈ 8–9% of hotel TTV — Pillar 2's structural margin pool.
- Multi-day/packaged tours **~US$89B gross across ~10,000 operators, 26.6% recent growth** — Pillar 3's tradeable asset class.
- Travel-agency SaaS only **US$1.2B→US$2.3B (2032)** — "the wedge, not the business."
- **Unit model**: hotels cede ~25% of consumer price to wholesale, split ~2/3 seller / 1/3 wholesaler — the invisible structural margin the markup engine + take-rate carve from.

## Comparables that de-risk the model
- **Fora** — proves agents pay for tooling+access at scale (15,000+ advisors, US$2.5B booked). *Warning:* it's a closed host-agency umbrella; Trellis's open peer-to-peer marketplace is the differentiated axis, but Fora's war chest means "Fora but open" can't be executed slowly.
- **Thatch → Mindtrip** — proves itinerary commerce; consumer-guide margins were too thin → validates **professional B2B2B resale on net rates** over low-ticket consumer guides.
- **Zicasso** — validates charging agents on **pay-on-conversion** (better cold-start trust than pay-per-lead) — the exact mechanism for the consumer→agent handoff fee.
- **kimkim** — validates the ~15% take-rate and signals convergence (agent-to-agent trade approaching from the opposite direction).

## Strategic position & moat
Trellis builds the layer that **consumes** OTA/bedbank inventory and adds what none of them will: professional workflow, the **tradeable itinerary as an asset class**, and an accountable human in the loop. The moat, if earned, is (a) **B2B2B liquidity** (finished itineraries listed and actually reselling), (b) **workflow lock-in** (agent bookings/clients/commissions live in Trellis), (c) the **compounding corpus** of structured, vetted, priced itineraries no one else is accumulating. Focus is a strategy input, not the moat — speed to liquidity in one beachhead is.

## Feasibility risks (severity)
- Revenue mis-sequencing (**High**) → adopt the P0–P3 stack above; monetize agent transactions from day one.
- Liquidity race vs converging funded players (**High**) → single beachhead; seed with power-seller agencies; concierge-broker early resales manually.
- Resale reluctance — specialists won't sell to potential competitors (**Med–High**) → test white-label + client-ownership terms with real agents *before* build.
- Ads compromise feed trust (**Medium**) → labeled sponsorship only; enforce the "every item actionable" rule on paid placements.
- Market-size figures are wide-variance vendor estimates (**Medium**) → ranges throughout; spot-check before investor use.

## Field validation plan (PRE-BUILD — not engineering tickets)
Agent interviews (n=15–20; test the riskiest assumption: will specialists resell to potential competitors under white-label + client-ownership, and at what revenue-share %?); **concierge MVP** (manually broker 10–20 itinerary resales before writing marketplace code — yields real take-rate tolerance + the first resold:self-built data point); two-sided smoke test (landing pages + waitlists for a first CAC signal); unit-economics worksheet (**blended take per trip vs two-sided CAC** — the single number that determines viability, already flagged open in PRD §15).

## Beachhead HYPOTHESIS (to validate, not a conclusion)
**Pakistan / GCC outbound corridors (Umrah & religious travel especially)** —
packaged-travel-heavy, served by thousands of small agents with thin tooling,
largely ignored by the Western tools in the PRD's competitive table while
regional OTAs concentrate on flights. Potentially winnable first liquidity from
the founder's home market.

## Engineering-relevant implications (for the operator to decide — NOT auto-filed)
The P0 build is already aligned with the validated direction (agent-side,
marketplace liquidity, self-drive/request-agent fork, provenance corpus). The
study surfaces a small number of monetization-roadmap candidates that are
**business/operator decisions**, deliberately NOT filed as tickets here:
1. **Light SaaS agent membership** (P0–P1 revenue stream the study says must
   exist early) — currently the app is free for agents. A membership/billing
   surface would be a P1 feature + a monetization decision.
2. **Consumer→agent handoff FEE on pay-on-conversion** (P2) — the request-agent
   fork exists (trip-handoffs); the *fee/billing* on conversion does not.
3. **What's-Hot sponsored placements** (P3) — Discover feed exists; labeled
   sponsorship/ads do not (and must respect the "every item actionable" rule).
4. **Beachhead seed/vertical** (Umrah/GCC packaged travel) — could shape demo
   seed data or a market-specific surface *after* the field-validation
   hypothesis is confirmed.

These stay off the backlog until the operator promotes them (roadmap discipline:
P0 = agent-side MVP; P1+/P2/P3 need an operator decision).
