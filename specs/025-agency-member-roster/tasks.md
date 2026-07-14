---

description: "Task list for Agency Member Roster (seed-0009)"
---

# Tasks: Agency Member Roster

**Input**: Design documents from `/specs/025-agency-member-roster/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/agency-admin.members.md, quickstart.md

**Tests**: Included — the spec's acceptance criteria explicitly requires tests that reuse the pinned RBAC ladder plus INV-004 tenant scoping proof.

**Organization**: Tasks are grouped by user story. US1 and US3 both land the same new procedure (there is exactly one procedure in this feature); US3's task is the tenant-isolation proof that only makes sense once the procedure from US1 exists, so it is sequenced after US1's implementation tasks but is its own independently-verifiable checkpoint (a distinct `it` block, not a modification of US1's code).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Phase 1: Setup

**Purpose**: None required — this feature adds to an existing package (`packages/api`) with no new project, dependency, or build config. Skipping to Foundational.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Confirm the authorization tier and data already exist so no story task rediscovers them.

- [X] T001 Confirm `agencyAdminProcedure` in `packages/api/src/trpc.ts` and the `member`/`user`/`organization` tables in `packages/db/src/schema-auth.ts` + exports in `packages/db/src/index.ts` need no changes (verified in research.md — no code change, this is a design-time confirmation only)

**Checkpoint**: Foundation confirmed — no blocking work, user story implementation can begin.

---

## Phase 3: User Story 1 - Owner/admin views the agency member roster (Priority: P1) 🎯 MVP

**Goal**: A new `workspace.agencyAdmin.members` query returns the full, correctly-shaped roster (name, email, role, joinedAt) for an owner or admin caller, scoped to their own agency.

**Independent Test**: Call `workspace.agencyAdmin.members()` as an owner and as an admin of the same agency and confirm both get the identical, correct roster.

### Implementation for User Story 1

- [X] T002 [P] [US1] Create `AgencyMemberSummary` type + `listAgencyMembers(db, agencyId)` service function in `packages/api/src/services/agency-members.ts` (join `member`+`user`, `WHERE organizationId = agencyId`, `ORDER BY createdAt ASC`, per data-model.md)
- [X] T003 [US1] Create `agencyAdminRouter` with a `members` query procedure gated by `agencyAdminProcedure` in `packages/api/src/routers/agency-admin.ts` (depends on T002)
- [X] T004 [US1] Mount `agencyAdmin: agencyAdminRouter` on `workspaceRouter` in `packages/api/src/routers/workspace.ts` (depends on T003)
- [X] T005 [P] [US1] Re-export `AgencyMemberSummary` from `packages/api/src/index.ts` (TS4023 nameability, matches the pattern used for every other service's outcome type)
- [X] T006 [US1] Write `l3-agency-admin.test.ts` in `packages/api/src/__tests__/` covering: owner sees full 3-member roster with correct fields (per contracts/agency-admin.members.md), admin also ALLOWED with correct roster (depends on T003, T004)

**Checkpoint**: User Story 1 is fully functional — an owner/admin can retrieve their roster. Independently testable via `DATABASE_URL=... pnpm --filter @tripforge/api test -- l3-agency-admin`.

---

## Phase 4: User Story 2 - Non-admin callers are denied (Priority: P2)

**Goal**: Member, traveler, and anonymous callers are rejected before any roster data is returned.

**Independent Test**: Call `workspace.agencyAdmin.members()` as a plain member, as a traveler, and with no session, and confirm each is rejected with the correct error code — no dependency on US1's test file passing first (this exercises the middleware, not the query result).

### Implementation for User Story 2

- [X] T007 [US2] Write `agency-admin-router-rbac.test.ts` (DB-less) in `packages/api/src/__tests__/` covering: anonymous → UNAUTHORIZED, traveler (no agency) → FORBIDDEN, agency member → FORBIDDEN (depends on T003, T004 existing so `workspace.agencyAdmin.members` is callable)

**Checkpoint**: User Stories 1 AND 2 both verifiable — `pnpm test` (no `DATABASE_URL` needed) proves the full reject ladder; the L3 suite proves the allow path.

---

## Phase 5: User Story 3 - Roster is strictly scoped to the caller's own agency (Priority: P1)

**Goal**: Prove agency A's owner never sees agency B's members, and vice versa.

**Independent Test**: Two agencies, each with their own owner and member rows; each owner's roster call returns only their own agency's rows.

### Implementation for User Story 3

- [X] T008 [US3] Add the two-tenant isolation `it` block to `l3-agency-admin.test.ts` in `packages/api/src/__tests__/` (same file as T006 — a distinct, independently-failing assertion, not a modification of T006's assertions) (depends on T003, T004)

**Checkpoint**: All three user stories independently verifiable. Full feature complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T009 Run `pnpm run lint` and fix any violations across all new/edited files
- [X] T010 Run `pnpm test` (full suite) and confirm no pre-existing test regressed
- [X] T011 Run `quickstart.md`'s manual validation against the live compose stack as part of the Live Test & Fix gate (INV-027) — no UI exists for this feature, so validation is the in-process/API-level steps quickstart.md describes, recorded in the PR's Live Test Evidence section

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No code changes — confirmation only. Does not block anything materially, but is recorded so no task duplicates this discovery work.
- **User Story 1 (Phase 3)**: The only phase with net-new production code (service + router + mount + export). Everything else depends on it existing.
- **User Story 2 (Phase 4)**: Depends on US1's router existing (T003, T004) so the procedure is callable, but its test file is new and independent of US1's test file.
- **User Story 3 (Phase 5)**: Depends on US1's router existing (T003, T004); its assertions live alongside US1's L3 test file (same file, additional `it` block) but are a distinct, independently-failing checkpoint.
- **Polish (Phase 6)**: Depends on all three stories being complete.

### Parallel Opportunities

- T002 and T005 touch different files with no interdependency and can run in parallel once T001's confirmation is done.
- T006 (US1's L3 test) and T007 (US2's RBAC test) touch different files and can be written in parallel once T004 (router mounted) is done.

---

## Parallel Example: User Story 1

```bash
# T002 and T005 have no file overlap and no ordering dependency on each other:
Task: "Create AgencyMemberSummary + listAgencyMembers in packages/api/src/services/agency-members.ts"
Task: "Re-export AgencyMemberSummary from packages/api/src/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (confirmation only)
2. Complete Phase 3: User Story 1 — service, router, mount, export, L3 allow-path test
3. **STOP and VALIDATE**: `DATABASE_URL=... pnpm --filter @tripforge/api test -- l3-agency-admin` passes
4. This alone is a shippable, secure-by-default increment: the procedure exists and is owner/admin-gated by the pre-existing, pinned `agencyAdminProcedure` middleware even before US2's explicit reject-path test is written (the middleware doesn't know or care whether a test asserts on it — but the test is what proves it for review, hence still doing US2/US3 in the same PR/cycle).

### Incremental Delivery

1. US1 → roster query works for owner/admin, proven against real Postgres.
2. US2 → explicit proof the reject ladder holds (no DB needed, fast).
3. US3 → explicit proof of tenant isolation (real Postgres, two agencies).
4. Polish → lint, full suite, quickstart validation, PR.

## Notes

- All three user stories ship together in one PR this cycle (small feature,
  single procedure) — the phase split above is for traceability and
  independent-test clarity, not for separate deployments.
- Verify tests fail before implementing is N/A in the strict TDD sense here
  since T006/T007/T008 are written after the router exists (T003/T004) by
  design — but each test is written to assert real behavior, not to match
  whatever the code happens to do, and was checked to fail if the
  corresponding gate were removed (e.g. T007 would fail if
  `agencyAdminProcedure` were swapped for `agentProcedure`).
