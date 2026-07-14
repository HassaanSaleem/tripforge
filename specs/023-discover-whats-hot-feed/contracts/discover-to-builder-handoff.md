# Contract: Discover → AI Builder handoff

The only cross-page interface this feature introduces (no new tRPC procedures — see research.md Decision 3).

## Request

`GET /workspace?destination=<value>`

- `destination` (query param, optional): a plain-text destination string, URL-encoded. When present and non-empty, MUST exactly match the format `"${city}, ${country}"` already used by the existing destination picker's `selectDestination()` (`apps/web/app/(workspace)/workspace/planner.tsx`) — e.g. `Lisbon, Portugal`.
- Emitted by: each `DiscoverFeedItem`'s "Plan this" action, using that item's `planDestination` field.

## Response (behavioral contract, not HTTP)

- `WorkspacePage` reads `searchParams.destination` server-side and passes it as `initialDestination` to `<Planner initialDestination={...} />`.
- `Planner` MUST seed `PlannerFormValues.destination` with `initialDestination` (when provided and non-empty) instead of the current hardcoded `""` default, on initial mount only.
- The pre-filled value behaves identically to a manually-typed or manually-picked destination — no special-cased downstream logic in `toTripRequest()` or the draft flow.
- If `destination` is absent, empty, or unparseable, `Planner` MUST fall back to today's behavior (empty destination field) — never an error or blank page.
- Pre-seeding MUST NOT clear or otherwise affect any other `PlannerFormValues` field (dates, party size, budget, currency all keep their existing defaults).

## Backward compatibility

- `/workspace` with no `destination` param (every existing entry point: nav link, direct navigation, bookmarks) is unaffected — `initialDestination` is `undefined` and `Planner`'s behavior is byte-identical to before this feature.
