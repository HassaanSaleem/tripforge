# Phase 0 Research: Planner UX Redesign

No `NEEDS CLARIFICATION` markers remain in the Technical Context — the codebase already establishes every pattern this feature needs. This document records the concrete UI-implementation decisions and why each was chosen over the alternatives considered.

## Decision 1: Segmented controls for budget-mode / trip-style

**Decision**: Replace the two `<select>` elements with a small reusable "segmented control" — a `role="radiogroup"` of `<button type="button" role="radio" aria-checked>` elements, styled via new `.tf-segmented` / `.tf-segmented button` CSS rules, one instance for budget mode (2 options) and one for trip style (3 options + implicit "no preference" default already supported today via `""`).

**Rationale**: The codebase has no existing chip/segmented/combobox component (confirmed by grep across `apps/web/app/(workspace)/workspace/*.tsx` and `globals.css` — every existing choice control is a plain `<select>`). A `role="radiogroup"` of buttons is the standard accessible pattern for "choose exactly one of a small fixed set," keeps keyboard/screen-reader behavior for free (arrow-key handling can be added via existing `tabIndex`/`onKeyDown`, or omitted and left to Tab+Enter which is still fully accessible), and needs zero new dependencies. It matches the `.tf-btn`/`.tf-badge` naming convention already used throughout `globals.css`.

**Alternatives considered**:
- Keep `<select>`, just change the *label* text (leave `value` attributes visible only in devtools). Rejected: FR-001/002 require *zero* raw enum text anywhere in the rendered page, and a `<select>`'s displayed text is exactly its human label already achievable — however the ticket and spec explicitly ask for "segmented control / nice selects," and a real segmented control is a clearer visual upgrade consistent with the "premium UI" bar (existing `premium-ui-is-the-product` project convention) versus leaving the native OS dropdown chrome.
- A third-party UI kit (Radix/Headless UI). Rejected: no such dependency exists in `apps/web/package.json` today; adding one is out of scope for a presentation-only ticket and would need its own reuse-scan/dependency justification.

## Decision 2: Destination picker as a custom filterable combobox (not `<datalist>`)

**Decision**: A text `<input>` backed by local component state, with a dropdown panel of destination "cards" (button elements, one per seeded destination) shown while focused/typing, filtered case-insensitively against the typed text; each card shows a two-letter flag glyph and a distinct gradient background keyed off the destination. Selecting a card sets the input's value to `"City, Country"` and closes the panel; typing anything (matching or not) keeps working as plain free text, so the exact same string reaches `toTripRequest` as today.

**Rationale**: The spec (FR-004) requires each seeded destination to have "a distinct visual treatment" (flag/color), which the native HTML `<datalist>` element cannot render — `<datalist>` options are plain text only, no styling. A custom combobox is the minimal implementation that satisfies "searchable," "visually distinguished," and "free text still works" simultaneously, with no new dependency (React state + existing CSS system only).

**Alternatives considered**:
- `<input list="destinations">` + `<datalist>`. Rejected: cannot render flags/gradients per option (browser-native rendering only), so it fails FR-004's visual-distinction requirement.
- A full async-search combobox hitting a backend endpoint. Rejected: the spec's Assumptions section is explicit that the seed list is static for this iteration and not backend-fetched (no catalog service exists yet — `demo-01-seed` is still `todo`); adding a new tRPC procedure for four hardcoded destinations would violate the "presentation-only" constraint (FR-009) and the Pre-Write Discipline's "no new abstraction beyond what the task requires."

## Decision 3: Hero draft card via the existing `.home-card` gradient pattern, not new imagery

**Decision**: Introduce `.tf-draft-hero` (and a small `.tf-draft-hero .cap`-style header) that reuses the same "image-forward without real photos" technique already shipped on the landing page (`globals.css` `.home-card .cap { background: linear-gradient(...) }`), keyed to the same per-destination color mapping used by Decision 2's picker cards (so a Lisbon draft's hero header uses the same gradient as the Lisbon picker card). Destinations outside the seeded set fall back to a default neutral gradient.

**Rationale**: The constitution's Compliance & Content Sourcing section prohibits presenting AI-generated or unlicensed imagery as real place photos; the landing page already solved "look image-forward without real photography" via CSS gradients, so reusing that exact pattern is both the Pre-Write "reuse" path and constitution-safe by construction (no imagery sourcing decision needed at all).

**Alternatives considered**:
- Pull real images from an external stock-photo API (Unsplash-class, as the constitution allows for the discovery feed). Rejected as out of scope: that's a licensed-content-sourcing integration (network calls, attribution, caching) — far beyond a presentation-only planner redesign, and explicitly deferred to the not-yet-built `demo-01-seed` catalog per the spec's Assumptions.
- Static bundled image files per seeded destination. Rejected: FR-011 requires no external image assets, and bundling four+ raster images for a demo-seed placeholder is exactly the kind of premature asset investment the ticket avoids by deferring real imagery to `demo-01-seed`.

## Decision 4: Pure-logic additions stay inside `planner-form.ts`

**Decision**: The destination seed list (`HERO_DESTINATIONS: { id, city, country, flag }[]`) and the two label maps (`BUDGET_MODE_LABELS`, `TRIP_STYLE_LABELS`) are added as exported constants in `apps/web/lib/planner-form.ts`, not inlined in `planner.tsx`.

**Rationale**: Matches the file's existing stated purpose ("Pure view logic for the workspace planner... DOM-free so it runs under the root Vitest node environment") and keeps `planner-form.test.ts` able to assert the label/seed data directly without a DOM, consistent with how `formatMinorAmount`/`toTripRequest` are already tested.

**Alternatives considered**: Inline constants directly in `planner.tsx`. Rejected: would be untestable under the existing DOM-free Vitest setup and breaks the established separation between presentation (`planner.tsx`) and pure logic (`planner-form.ts`) that the rest of the file already documents as load-bearing.
