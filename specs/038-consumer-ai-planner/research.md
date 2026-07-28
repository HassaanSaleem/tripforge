# Research: Consumer Chat-First AI Planner

## D1 — Reuse the engine without forking (RBAC vs compute)

**Decision**: Reuse `interpretChatTripRequest` + `draftOptions` + shared `plannerCore` from
`packages/api/src/services/planner.ts`; add only traveler-facing procedures + a redaction wrap.

**Rationale**: The interpret service already ignores its session param (`_session`), and
`plannerCore`/`draftOptions` read ONLY `session.agencyId`. The difference between the agent
and consumer paths is purely (a) the RBAC gate and (b) whether the result is persisted.

**Change**: two mechanical, behavior-preserving refactors —
- `interpretChatTripRequest(container, input)` (drop the unused session arg).
- `plannerCore(container, agencyId, input)` and `draftOptions(container, agencyId, input)`
  (take the `agencyId` they actually use, not the whole session). `selectDraftOption`
  (agent-only, persisting) keeps its `AgentSessionContext` and calls
  `plannerCore(container, session.agencyId, ...)`.

The agent router (`itinerary.ts`) call-sites are updated in the same change so the agent
builder behaves identically. **Alternatives rejected**: (a) fabricate an `AgentSessionContext`
for travelers — reads as "a traveler holding an agent session," muddies INV-024; narrowing to
`agencyId` is cleaner and truthful. (b) copy the pipeline into a consumer service — a fork of
the exact thing the ticket says NOT to fork.

## D2 — The agency-less ownership problem (ALWAYS-HALT avoidance)

**Decision**: The consumer compare itinerary is **never persisted**; it carries an
**ephemeral `randomUUID()` agencyId** (per draft call), consumed only in-memory to satisfy the
canonical schema's required field, then redacted before display. The request-agent fork writes
a NEW agency-less `consumer_plan_request` lead. Full consumer self-drive booking is deferred.

**Rationale**: Every `Itinerary` requires an `agencyId` (tenant, INV-004). A from-scratch
consumer plan has no agency. Persisting an agency-less itinerary, attributing markup on an
agency-less booking, or adding a platform take-rate would each be a canonical-schema and/or
revenue-share/ownership change — operator ALWAYS-HALT (DIRECTIVE §2; GOAL.md ruling
2026-07-21 keeps self-book v0 inside existing money math). Never persisting the preview and
routing demand through a non-money lead keeps the whole feature out of the HALT list.

**Alternatives rejected**: (a) a "house/platform agency" owning consumer plans — invents
platform-as-agency ownership + who-keeps-margin = revenue/ownership decision (HALT). (b) make
`trip_handoff_request.itineraryId/agencyId` nullable — mutates a money-adjacent table's shape.
A dedicated, isolated lead table is safer.

## D3 — INV-020 redaction reuses the established boundary

**Decision**: Redact each compare option with the EXISTING pure projection
`toClientItineraryView(document, agencyName, bookedPriceByItemId)` (client-view.ts).

**Rationale**: In an assembled draft, `assemble.ts` sets `sellPrice === netRate` (markup
applies at quote time), and `toClientItineraryView` surfaces a SINGLE sell figure per item
and drops `netRate`/supplyRef/ids — the identical trust boundary spec 010 client-view and
spec 036 self-book already ship for unbooked itineraries. The traveler sees one price, never a
net+markup split. For a consumer draft there is no booking, so `bookedPriceByItemId` is empty
and `agencyName` is null (brand-neutral). The per-category breakdown (`fit.categories`:
`allocatedMinor`/`spentMinor`/`state`) is single-figure and carries no net/markup split, so it
is surfaced as-is. **Alternative rejected**: a bespoke consumer redactor — duplicates the
trust boundary and risks drift from the canonical one.

## D4 — The lead record is NOT a money path

**Decision**: `consumer_plan_request` stores the authoritative trip criteria (destination,
dates, party, budget), the chosen variant + a client-provided option title (a label), the
traveler's contact, and a status — and NO net rate / markup / take-rate / revenue-share /
sell-total-echo. Creating one moves no money and touches no booking inventory.

**Rationale**: Mirrors spec 022's explicit classification ("Not a money path — no
revenue-share/markup columns"). The traveler's own budget is the authoritative money context
for the agent, who re-quotes for real when they pick the lead up. We deliberately do NOT store
a client-echoed sell total (avoids trusting client-supplied pricing, FR-012 spirit) — the
budget the traveler set is stored instead.

## D5 — Migration mechanism

**Decision**: Add the table to a new `schema-consumer-planner.ts` module and register it in
`schema.ts`/`index.ts`; the compose `migrate` one-shot (`drizzle-kit push`) creates it. No
hand-written SQL. **Rationale**: matches every prior table addition in this repo (drizzle push
against `schema.ts`); `apply-views.mjs` handles views only and is unaffected.

## D6 — Distinct consumer component (INV-024), shared server

**Decision**: Build a brand-neutral `consumer-planner.tsx` in the `(client-view)` group rather
than importing the workspace `ChatEntry`/`Planner`. **Rationale**: INV-024 — workspace UI /
branding must not leak into the client experience; the consumer surface is a separate route
group by design (spec 033/036/037 all keep consumer components distinct). The reuse is at the
SERVER (the tRPC engine), which is where forking would actually hurt. The chat/draft/fork
interaction model mirrors the agent one so behavior is consistent.

## D7 — Keyless determinism preserved

**Decision**: No change to `packages/llm`. **Rationale**: interpret + draft ride the unchanged
`FakeLLM.interpretTripRequest`/`draftItinerary`; the transcript-join accumulation (spec 035)
is inherited. Tests and the compose stack work with no `ANTHROPIC_API_KEY` (INV-019).
