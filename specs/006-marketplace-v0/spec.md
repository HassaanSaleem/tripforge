# Feature Specification: Marketplace v0 — list, license/white-label, ratings, revenue-share plumbing

**Feature Branch**: `006-marketplace-v0`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Marketplace v0: list/license/white-label + revenue-share plumbing (Constitution I/VI). Build the minimal two-sided marketplace so the bootstrap sequence deterministically reaches the constitution P0 liquidity milestone: vetted agents list finished itineraries; other agents license/white-label them; ratings; revenue-share recorded in the transaction path (INV-012). Seller/reseller are relationships on a listing, not auth roles. The spec MUST make the who-may-list decision explicit (vetting gate) rather than inherit the accidental sign-up default."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seller lists a finished itinerary (Priority: P1)

A vetted agency (the **seller**) takes a finished, client-ready itinerary it authored and publishes it to the marketplace as a listing: a title, the itinerary it delivers, a license price, the license terms it is offered under, and the revenue-share obligation (in basis points) that any licensed copy will carry. Other agencies can browse active listings; the seller can deactivate a listing at any time.

**Why this priority**: Without supply there is no marketplace. Listing is the smallest independently valuable slice — it creates browsable supply and exercises the vetting gate that decides who may sell (Constitution VI: "vetted agents list").

**Independent Test**: Can be fully tested by vetting one agency, having it list an itinerary it owns, and confirming the listing is visible to another agency — while an unvetted agency's attempt to list is refused.

**Acceptance Scenarios**:

1. **Given** a vetted agency owning a finished itinerary with complete provenance, **When** it creates a listing with a license price and revenue-share terms, **Then** the listing becomes visible to other agencies as active, carrying the seller's declared license terms.
2. **Given** an agency that has NOT been vetted for marketplace supply, **When** it attempts to create a listing, **Then** the attempt is refused with an explicit "not vetted" outcome and no listing is created.
3. **Given** an agency attempting to list an itinerary owned by a different agency, **When** it submits the listing, **Then** the attempt is refused and no listing is created (tenant ownership enforced).
4. **Given** an itinerary missing any mandatory provenance element (author, license terms, revenue share), **When** the owner attempts to list it, **Then** the attempt is refused with a validation outcome naming the missing provenance.
5. **Given** an active listing, **When** the seller deactivates it, **Then** it no longer appears to buyers and can no longer be licensed, while previously licensed copies are unaffected.

---

### User Story 2 - Reseller licenses and white-labels a listing (Priority: P2)

A second agency (the **reseller**) licenses an active listing. In one atomic transaction the reseller pays the license price, the platform records its take, the seller is credited the remainder, and the reseller receives a white-labeled copy of the itinerary under its own agency — with provenance (original author, license terms, revenue-share obligation, rebrand lineage) stamped into the copy so the obligation travels with the trip.

**Why this priority**: This is the trade-layer money path — the moat (Constitution I) and the mechanical trust enforcement (Constitution VI / INV-012). It depends on User Story 1 existing but is the transaction that produces marketplace revenue and the resold-trip supply.

**Independent Test**: With one active listing in place, a second vetted agency licenses it; verify the reseller now owns a rebranded copy whose provenance references the original author and terms, and that the recorded money split (seller credit + platform take = license price) exists — all created together or not at all.

**Acceptance Scenarios**:

1. **Given** an active listing and a distinct vetted reseller agency, **When** the reseller licenses it, **Then** in the same transaction: (a) a license record exists linking listing, seller, and reseller; (b) the revenue-share ledger records the seller credit and platform take summing exactly to the license price; (c) the reseller's agency owns a new itinerary copy whose provenance carries the original author, the license terms, the revenue-share obligation, and a rebrand lineage naming the seller's itinerary.
2. **Given** the license transaction fails at any point after it begins (e.g., the copy cannot be created), **When** the failure occurs, **Then** NO artifacts survive — no license record, no ledger entries, no itinerary copy (state conservation; no orphan ledger rows).
3. **Given** a reseller that already holds a license on a listing, **When** it attempts to license the same listing again, **Then** the attempt is refused with an "already licensed" outcome and no money is recorded twice — including when the two attempts race concurrently (exactly one succeeds).
4. **Given** a deactivated listing, **When** an agency attempts to license it, **Then** the attempt is refused and nothing is recorded.
5. **Given** the seller's own agency, **When** it attempts to license its own listing, **Then** the attempt is refused (self-dealing would fabricate marketplace volume and ratings eligibility).
6. **Given** an unvetted agency, **When** it attempts to license a listing, **Then** the attempt is refused (both sides of a marketplace transaction are vetted agencies at v0).

---

### User Story 3 - Licensee rates a listing (Priority: P3)

An agency that has licensed a listing leaves a rating (1–5 stars, optional comment) on it. The listing shows its average rating and rating count; a seller's reputation is the aggregate across its listings. Only licensees may rate — trust is enforced mechanically, not by policy.

**Why this priority**: Ratings close the trust loop of the P0 milestone ("ratings + revenue-share plumbing") but have no value until listings and licenses exist.

**Independent Test**: After one completed license, the reseller rates the listing and the listing's aggregate reflects it; a third agency with no license is refused.

**Acceptance Scenarios**:

1. **Given** an agency holding a license on a listing, **When** it submits a rating of 1–5, **Then** the rating is recorded and the listing's average and count update.
2. **Given** an agency with NO license on a listing, **When** it attempts to rate it, **Then** the attempt is refused and no rating is recorded.
3. **Given** an agency that has already rated a listing, **When** it submits a new rating, **Then** the new rating replaces its previous one (one rating per agency per listing; the count does not inflate).
4. **Given** a rating outside 1–5, **When** it is submitted, **Then** it is refused with a validation outcome.

---

### Edge Cases

- Listing an itinerary that is already actively listed by the same agency: refused ("already listed") — one active listing per itinerary prevents duplicate supply and split ratings.
- Licensing while the seller concurrently deactivates the listing: exactly one of the two outcomes wins; a completed license is never attached to a listing that was already inactive at transaction time.
- Two different resellers license the same listing concurrently: both succeed independently (licenses are non-exclusive across agencies); each produces its own complete transaction and copy.
- The white-label copy must not leak the seller's client-facing branding or the platform's: it is re-homed to the reseller's agency; the reseller re-brands before client use (client-view branding rules INV-020 already apply to all itineraries).
- Revenue-share basis points at the extremes (0 and 10000): both are valid seller choices; the split math must be exact at both ends (platform take applies to the license price independently).
- A listing price of zero: allowed (a seller may share freely); ledger entries still record the transaction with zero amounts so lineage and PMF events remain complete.
- Currency: the license price is denominated in the listed itinerary's single currency; the split inherits that currency — no implicit conversion inside the marketplace transaction.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an agency to be marked as **vetted for marketplace supply** by a platform-level operator action only — vetting is never self-serve and is NOT implied by signing up or creating an agency (explicit who-may-list gate; Constitution VI).
- **FR-002**: The system MUST refuse listing creation and license purchase by agencies that are not vetted, with an explicit typed outcome.
- **FR-003**: A vetted agency MUST be able to create a marketplace listing from an itinerary it owns, declaring: license price (integer minor units in the itinerary's currency), human-readable license terms, and a revenue-share obligation in basis points (0–10000).
- **FR-004**: The system MUST refuse to list an itinerary whose provenance is incomplete for listing (original author, license terms, revenue share — the listed-itinerary rule INV-002); the itinerary's mandatory provenance is established or completed at listing time from the seller's declared terms.
- **FR-005**: The system MUST enforce that only the itinerary's owning agency can list it, and that one itinerary has at most one ACTIVE listing at a time.
- **FR-006**: Agencies MUST be able to browse active listings (title, destination summary, price, license terms, revenue-share obligation, seller aggregate rating); deactivated listings are excluded.
- **FR-007**: A seller MUST be able to deactivate its own listing; deactivation MUST NOT affect existing licenses or copies.
- **FR-008**: A vetted agency other than the seller MUST be able to license an active listing. The license transaction MUST atomically (all-or-nothing, one transaction — INV-012): create the license record; record the revenue-share ledger split (seller credit + platform take = license price, exact integer split); create the white-labeled itinerary copy owned by the reseller's agency.
- **FR-009**: The white-labeled copy MUST carry complete provenance: original author (the ORIGINAL author, preserved across chains of resale), the license terms, the revenue-share obligation in basis points, and a rebrand lineage extended with the source itinerary (INV-002).
- **FR-010**: All split math (platform take, seller credit) MUST be computed by pure domain money functions on integer minor units (INV-009/INV-010); the platform take-rate is a named platform-level configuration value, defaulting to 1000 basis points (10%) at v0.
- **FR-011**: Every failure on the license path MUST conserve state: no license record, ledger entry, or itinerary copy may survive a failed transaction (INV-011; verified by an integration test that forces a mid-transaction failure).
- **FR-012**: A reseller MUST NOT be able to license the same listing twice (typed "already licensed" outcome), including under concurrent duplicate attempts — exactly one license wins. Sellers MUST NOT license their own listings.
- **FR-013**: Only agencies holding a license on a listing MUST be able to rate it: integer 1–5 with optional comment, one rating per agency per listing (resubmission replaces), aggregate average and count visible with the listing.
- **FR-014**: The system MUST emit PMF instrumentation events in the same flows: listing created, listing licensed (with amounts: license price, platform take, seller credit), listing rated — sufficient to measure marketplace take-rate revenue per active agent and the resold-to-self-built trip ratio (a copy with non-empty rebrand lineage counts as resold). PINNED MAPPING (spec-gap-0006b, closing a SPEC-SILENT gap from the PR #29 implementation): "listing licensed" reuses the existing `take_rate_accrued` PMF event type rather than adding a new one — its `amountMinor` carries the platform take, and it gains two additive fields, `priceMinor` (license price) and `sellerCreditMinor` (seller credit), present only on license-driven accruals; `priceMinor = amountMinor + sellerCreditMinor` exactly (row-local conservation identity, INV-009/INV-010). "listing created" and "listing rated" are the pre-existing no-money `listing_created`/`listing_rated` event types (spec 006 research D4).
- **FR-015**: All marketplace read/write paths MUST be tenant-scoped (INV-004): an agency can manage only its own listings, licenses, ratings, and copies; browsing exposes only what a buyer legitimately sees (no other agency's client data — client ownership stays with the licensee, Constitution VI).

### Key Entities

- **Marketplace listing**: an offer to license one finished itinerary — seller agency, source itinerary, license price (minor units + currency), license terms text, revenue-share obligation (bps), active/inactive status, created/deactivated timestamps.
- **License**: the completed trade — listing, seller agency, reseller agency, the produced itinerary copy, price paid, split amounts recorded, timestamp. At most one per (listing, reseller agency).
- **Revenue-share ledger record**: immutable money record written inside the license transaction — exactly one per license, carrying the full split (license price, platform take, seller credit — a row-local conservation identity) in integer minor units with currency, referencing the license.
- **Rating**: one per (listing, rating agency), integer 1–5, optional comment, timestamp; only from agencies holding a license.
- **Vetting status**: per-agency marker (granted by platform operator action, with timestamp) gating supply-side and demand-side marketplace participation.
- **White-labeled copy**: a full itinerary (canonical schema) owned by the reseller's agency, provenance-stamped (original author, license terms, revenue-share bps, extended rebrand lineage).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of listing attempts by unvetted agencies are refused with the explicit "not vetted" outcome; a vetted agency can complete listing creation in one action given an itinerary it owns.
- **SC-002**: 100% of completed license transactions show an exact conservation identity — seller credit + platform take = license price, in integer minor units of the listing currency — and 100% of failed license attempts leave zero marketplace records (no orphan ledger rows, no orphan copies).
- **SC-003**: 100% of white-labeled copies carry complete provenance (original author, license terms, revenue-share bps, non-empty rebrand lineage) — verifiable on every copy produced in the flow.
- **SC-004**: Ratings from non-licensees are refused 100% of the time; a licensee's rating is reflected in the listing aggregate immediately after submission.
- **SC-005**: Every listing/license/rating action emits its PMF event, making marketplace take-rate revenue per active agent and resold-vs-self-built ratio computable from recorded data alone.
- **SC-006**: The end-to-end trade journey — list → license/white-label → rate — completes against a real running stack with real persisted state in an integration test, including the forced-failure conservation branch.

## Assumptions

- **Vetting mechanism at v0**: vetting is a per-agency flag settable only by a platform operator (out-of-band action at P0 — no admin UI; the operator vets via a platform-level script/procedure). This is the explicit who-may-list decision raised by iteration-2 finding IMP-1 — see "Decisions surfaced for operator review" below.
- **Both sides vetted**: at v0 the vetting gate applies to sellers AND resellers (a marketplace transaction happens between two vetted agencies). Relaxing the demand side is a later operator decision.
- **Revenue-share scope at v0**: the license transaction records the license-fee split (seller credit + platform take). The revenue-share obligation (bps) is additionally stamped into the copy's provenance so that future booking flows can honor it on resold-trip margins; wiring that booking-side split is P1 ("provenance & revenue-share hardening") and out of scope here.
- **License price currency** equals the itinerary's single currency (schema enforces one currency per itinerary); no conversion occurs in the marketplace transaction.
- **Duplicate licensing** by the same agency on the same listing is refused at v0 (prevents accidental double-pay); granting a second copy to the same agency is a later decision if a real need appears.
- **Ratings scope**: ratings attach to listings; a seller's reputation is the aggregate of its listings' ratings. Separate agent-level rating records are not created at v0.
- **Marketplace seller/reseller are relationships on a listing/license** (per the system architecture), not auth roles — no new auth roles are introduced.
- **No supplier interaction**: the marketplace trades finished itineraries; it never touches supplier inventory, so no supply-port calls occur in these flows.
- **Web UI minimalism**: v0 delivers the capability at the platform API level plus the smallest workspace surface needed to witness the journey live in a browser; a full marketplace browsing UI is not required to meet the P0 milestone.

### Decisions surfaced for operator review

These choices define new marketplace semantics the constitution names but does not quantify. The spec proceeds with the recommended defaults; the operator can override at PR review (DIRECTIVE #3).

- **D-0006.a — Who may list (vetting gate)**: RECOMMENDED (and specified above): explicit per-agency vetted-for-marketplace flag, grantable only by platform operator action, required for BOTH listing and licensing. Alternative rejected: inheriting today's accidental default (anyone who signs up can list) — contradicts Constitution VI "vetted agents list".
- **D-0006.b — Platform take-rate default**: RECOMMENDED: named config value, default 1000 bps (10%) of the license price at v0. The number is a placeholder for a real pricing decision; it is deliberately a single config constant so changing it is not a schema change.
- **D-0006.c — Media rights on license (transfer / strip / attribution-obligation)** *(seed-0023, filed once content-library media (seed-0022/spec 015) made this observable: `whiteLabelCopy` in `packages/marketplace/src/white-label.ts` spreads the source itinerary's `media`/per-item `media` arrays verbatim into the reseller's copy, including any `agent-upload`/`traveler-ugc` asset's `attribution` string naming the ORIGINAL agency)*. Three options, per `MediaRef.source`:
  - **(a) Transfer under license terms** — the copy carries the media with no distinguishing obligation; the reseller may re-brand/re-present it as if their own. Simplest, and arguably fine for `licensed-stock`/`official-embed` (the license already covers third-party-licensed content), but on `agent-upload`/`traveler-ugc` it silently re-attributes another agency's authentic photo/video to the reseller with no trace.
  - **(b) Strip on license** — `agent-upload`/`traveler-ugc` media (and their `attribution`) are dropped from the copy at license time; `licensed-stock`/`official-embed` (third-party-sourced, not agency-authored) travel unchanged. Keeps the reseller's gallery honest but destroys real content the buyer may have believed they were licensing, and needs a pre-license rights disclosure so a buyer isn't surprised by an empty gallery.
  - **(c) Travel with a mandatory attribution obligation** — media travels unchanged (no code/behavior change to `whiteLabelCopy`, which already preserves `attribution` byte-for-byte per-source), but the client-view/marketplace-card rendering (spec 010 FR-007 allowlist, `packages/api/src/services/client-view.ts`) MUST surface the stored `attribution` string wherever it is present, so a traveler or a browsing agency always sees the true original creator — never silently implied as the reseller's own work.
  - **RECOMMENDED: (c)** — it requires no change to the money/schema/adapter boundary (the `attribution` field and per-source semantics already exist in the v0.1.0 canonical schema; only a client-view/marketplace-UI read-side projection is added), it is the least disruptive to the "license a trip, get its pictures too" value proposition, and it satisfies Constitution VI (provenance as a first-class, never-silently-erased product surface) without deciding a third-party licensing question the platform cannot adjudicate at v0. Alternative (b) is not rejected outright — if a future incident shows real rights harm, escalate there — but (c) is the safer v0 default given no reported complaint exists yet.
  - **Scope note**: this decision governs the FIRST license only. Whether a RESALE (a licensed copy re-listed and re-licensed) may further mutate or must preserve this attribution chain is coupled to the open **RESALE-SHARE-SEMANTICS** desk row (`OPERATOR-DESK.md`) — a distinct question (money split vs. content rights) that should be ratified alongside, not instead of, this one.
  - **Follow-up on ratification**: once decided, file an implementation ticket to (i) keep `whiteLabelCopy` unchanged if (c), or add the strip/disclosure logic if (b); and (ii) if attribution must render, amend spec 010 FR-007 (client-view allowlist) through the speckit flow to add `attribution` as a projected field, with an L1/L3 test proving no other `MediaRef` field (`id`, `source`, `storageKey`) crosses the boundary.
