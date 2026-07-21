# Feature Specification: Two-sided landing pages (global + travelers + agents)

**Feature Branch**: `kitchen/fix-goal-landing-pages-two-sided`

**Created**: 2026-07-21

**Status**: Draft

**Input**: Ticket `goal-landing-pages` (GOAL.md Deliverable 1) — build three public marketing routes to a premium travel-grade bar on the existing shared theme system: rework the global landing into a true two-sided overview; add `/for-travelers` (consumer story + `demos/tripforge-clients.mp4`) and `/for-agents` (professional story + `demos/tripforge-agents.mp4`); shared nav across all three plus traveler/agent sign-in; responsive, real imagery only. Presentation only — no money path, no schema, no supply-adapter.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A first-time visitor understands both sides and picks their path (Priority: P1)

Someone arrives at the product's front door (`/`) with no context. They must immediately grasp that TripForge is **two products on one engine** — a professional surface for travel agents and a consumer surface for travelers — and be given a clear, deliberate fork to whichever story is theirs. Per Constitution Principle I the traveler story is framed as demand that funnels into the agent network (plan a trip, or have an agent arrange it), not a standalone-planner pitch.

**Why this priority**: The global landing is the campaign's public face and the entry point every other page links back to. Without a clear two-sided overview and a working fork, neither audience finds its story. It is also the page that carries the load-bearing home smoke assertions, so it must land first.

**Independent Test**: Load `/`, confirm the two-sided overview renders with a visible split to "For travelers" and "For agents", follow each fork link to its destination, and confirm the existing home smoke assertions still hold (a heading named "TripForge" and a link matching /Agency workspace/i are both present).

**Acceptance Scenarios**:

1. **Given** a visitor on `/`, **When** the page loads, **Then** a heading named "TripForge" is visible, the page presents both a traveler story and an agent story as first-class, and a link whose accessible name matches /Agency workspace/i is present.
2. **Given** a visitor on `/`, **When** they choose the traveler fork, **Then** they arrive on `/for-travelers`.
3. **Given** a visitor on `/`, **When** they choose the agent fork, **Then** they arrive on `/for-agents`.
4. **Given** a visitor on `/` at a 375px-wide viewport, **When** the page renders, **Then** there is no horizontal scrolling (content fits the viewport width).

---

### User Story 2 - A prospective traveler sees the consumer story and a demo (Priority: P2)

A traveler-minded visitor lands on `/for-travelers`. They see the consumer story — plan a trip with AI, see a live-priced bookable itinerary, self-drive or hand off to an agent — and can watch a real product demo video. Clear calls to action route them to traveler sign-in / plan-a-trip, and the framing keeps demand pointed at the agent network (Principle I).

**Why this priority**: This is the consumer front door the campaign is building. It must exist, tell the story, and play the staged demo, but it depends on nothing except the shared nav and the staged asset.

**Independent Test**: Load `/for-travelers`, confirm the consumer narrative renders, the demo `video` element is present with the traveler demo source and a poster and playback controls, and the CTA links to traveler sign-in.

**Acceptance Scenarios**:

1. **Given** a visitor on `/for-travelers`, **When** the page loads, **Then** the consumer story is presented and a video player for the traveler demo is visible with a poster image and user-operable controls.
2. **Given** the traveler demo video, **When** the page loads, **Then** the video does NOT begin playing on its own and does NOT play sound without the user pressing play.
3. **Given** a visitor on `/for-travelers`, **When** they act on the primary CTA, **Then** they reach the traveler sign-in / planning entry point.
4. **Given** a visitor on `/for-travelers`, **When** they use the shared nav, **Then** they can reach `/` and `/for-agents`.

---

### User Story 3 - A prospective agent sees the professional story and a demo (Priority: P2)

An agency-minded visitor lands on `/for-agents`. They see the professional story — budget-aware AI builder, inline net-rate quote-then-book with markup control, and the two-sided marketplace — and can watch the agent demo video. CTAs route them to agent sign-up / the workspace.

**Why this priority**: The agent surface is the wedge (Principle II); the agents page is its pitch. Symmetric to US2 and independent of it.

**Independent Test**: Load `/for-agents`, confirm the professional narrative renders, the demo `video` element is present with the agent demo source and a poster and controls, and the CTA links to agent sign-up.

**Acceptance Scenarios**:

1. **Given** a visitor on `/for-agents`, **When** the page loads, **Then** the professional story is presented and a video player for the agent demo is visible with a poster image and user-operable controls.
2. **Given** the agent demo video, **When** the page loads, **Then** the video does NOT begin playing on its own and does NOT play sound without the user pressing play.
3. **Given** a visitor on `/for-agents`, **When** they act on the primary CTA, **Then** they reach agent sign-up / the workspace entry point.
4. **Given** a visitor on `/for-agents`, **When** they use the shared nav, **Then** they can reach `/` and `/for-travelers`.

---

### Edge Cases

- **Video asset is slow or fails to load**: the poster image stands in for the video frame and the surrounding story is still fully readable and navigable; the page is not blocked on the video.
- **Narrow / mobile viewport (~375px)**: no horizontal scroll on any of the three pages; nav, hero, and video reflow to a single column.
- **Reduced-motion / no-autoplay expectation**: no page auto-plays video with sound; playback is user-initiated (respects `prefers-reduced-motion` by never auto-animating a video).
- **A visitor deep-links straight to `/for-travelers` or `/for-agents`** (not via `/`): the shared nav still lets them reach the other two pages and both sign-ins.
- **Dark OS theme**: pages are legible (no unreadable hardcoded colors); a full dark palette is explicitly deferred (see Assumptions) — this feature does not introduce global dark mode.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The global landing (`/`) MUST present TripForge as a two-sided product, giving the traveler story and the agent story equal first-class prominence, with a clearly visible fork/split that lets a visitor choose their path.
- **FR-002**: The global landing MUST retain a heading whose accessible name is exactly "TripForge" and a link whose accessible name matches /Agency workspace/i (preserving the existing home smoke assertions).
- **FR-003**: A `/for-travelers` route MUST exist and tell the consumer story: describe/plan a trip with AI, a live-priced bookable itinerary, and the self-drive-or-request-an-agent path, framed as demand feeding the agent network (Constitution Principle I) — NOT as a standalone consumer-planner pitch.
- **FR-004**: `/for-travelers` MUST embed the staged traveler demo video (`/demos/tripforge-clients.mp4`) using a native video player that shows user-operable controls, uses a poster still sourced from the staged client shots, loads metadata only (does not eagerly download the full video), and MUST NOT autoplay with sound.
- **FR-005**: `/for-travelers` MUST provide a primary call to action that routes the visitor to traveler sign-in / the trip-planning entry point.
- **FR-006**: A `/for-agents` route MUST exist and tell the professional story: budget-aware AI builder, inline net-rate quote-then-book with markup control, and the two-sided marketplace (resell/white-label).
- **FR-007**: `/for-agents` MUST embed the staged agent demo video (`/demos/tripforge-agents.mp4`) using a native video player that shows user-operable controls, uses a poster still sourced from the staged agent shots, loads metadata only, and MUST NOT autoplay with sound.
- **FR-008**: `/for-agents` MUST provide a primary call to action that routes the visitor to agent sign-up / the workspace entry point.
- **FR-009**: All three pages MUST share a consistent navigation surface that links Home (`/`), For travelers (`/for-travelers`), For agents (`/for-agents`), traveler sign-in, and agent sign-in.
- **FR-010**: All three pages MUST render without horizontal scrolling at a mobile viewport width of ~375px (content fits the viewport; layout reflows to a single column).
- **FR-011**: All three pages MUST be styled through the existing shared design-token / theme system (globals.css `.tf-*`/`.home-*` kit); no page may fork its own private visual system or hardcode off-palette colors.
- **FR-012**: All imagery and video used MUST come only from the staged, real assets under `/demos` and `/shots` (Compliance & Content Sourcing) — no fabricated place photos, no AI-generated visuals presented as real, no scraped/re-hosted third-party images.
- **FR-013**: The feature MUST NOT change the canonical itinerary schema, any money path, the supply-adapter boundary, authentication, or any server/API behavior — it is presentation/routing only (new/rewritten pages, nav, CSS, and their e2e coverage).
- **FR-014**: Navigation between all three pages MUST be covered by an automated end-to-end test (Home ↔ For travelers ↔ For agents), and the existing home smoke assertion MUST remain green.

### Key Entities

*None — this feature introduces no data entities. It renders static marketing content and links; it reads and writes no persistent state.*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three routes (`/`, `/for-travelers`, `/for-agents`) return a rendered page (HTTP 200) and display their intended heading/story.
- **SC-002**: From any one of the three pages, a visitor can reach the other two pages and both sign-in entry points using only the shared nav (0 dead ends).
- **SC-003**: Both demo videos are present as user-operable players with a poster and never auto-play with sound; a visitor can start playback with a single deliberate action.
- **SC-004**: None of the three pages produces horizontal scrolling at a 375px-wide viewport.
- **SC-005**: The existing home smoke assertions still pass unchanged (heading "TripForge" and a /Agency workspace/i link both present on `/`), i.e. zero regression to the smoke suite.
- **SC-006**: 100% of the imagery/video on the pages is drawn from the staged real assets — zero fabricated or non-sourced media.

## Assumptions

- **Reuse the existing theme system**: the pages are built on the shared `.tf-*` / `.home-*` design tokens already in `apps/web/app/globals.css` (memory: "Premium UI is the product"); new CSS is additive to that kit, not a per-page fork.
- **"Theme-aware (light/dark)" is scoped to the shared tokens**: the design system has **no dark-mode palette today** (no `prefers-color-scheme` overrides exist anywhere in globals.css). Introducing global dark mode is a cross-cutting change that belongs to the separate `goal-ui-depoliteform` ticket, not here. For this feature "theme-aware" means built on the shared token system and legible under a dark OS setting; a dedicated dark palette is **deferred** and recorded as an assumption rather than silently dropped.
- **Poster stills**: `/for-travelers` uses `shots/clients/01-shared-trip.png` and `/for-agents` uses `shots/agent/01-dashboard.png` as the video posters (both staged and confirmed present); the remaining staged shots may be used as supporting imagery.
- **Sign-in / sign-up destinations already exist**: traveler sign-in is `/view/sign-in`, agent sign-in is `/sign-in`, agent sign-up is `/sign-up`, and the workspace is `/workspace` — the nav/CTAs link these existing routes; no auth changes.
- **Routes are public**: all three pages are anonymously reachable marketing content (no session required), consistent with the current `/` being public.
- **No production deploy**: work lands on the `campaign/two-sided-surface` branch only; full INV-027 live validation + UAT gate still run (GOAL.md).
- **Videos are large** (agent demo ~20MB): `preload="metadata"` and a poster keep initial page weight down; the full video downloads only when the visitor presses play.

## Dependencies

- Staged assets in `apps/web/public/`: `demos/tripforge-clients.mp4`, `demos/tripforge-agents.mp4`, `shots/clients/*.png`, `shots/agent/*.png` (all present).
- The existing shared theme kit in `apps/web/app/globals.css`.
- Existing auth/workspace routes for the nav/CTA targets (linked, not modified).

## Out of Scope

- Any change to money paths, the canonical itinerary schema, the supply-adapter boundary, or authentication.
- A global dark-mode palette (deferred to `goal-ui-depoliteform`).
- New product functionality behind the CTAs (they link to existing entry points).
- Consumer self-booking, the What's-Hot feed, chat-first builder, and the standalone traveler account — those are separate tickets.
