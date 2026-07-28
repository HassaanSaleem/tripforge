# TripForge

> PRD codename **Trellis** (both names pending trademark clearance).

An AI-native travel platform to **build, book, and trade** trips — for travel
agents and travelers. Two surfaces on one shared engine:

- **Professional surface (P0, in progress)** — a budget-aware AI itinerary
  builder, inline net-rate booking with markup control, and a two-sided agent
  marketplace with resale / white-label.
- **Consumer surface (P2, roadmap)** — a self-serve AI planner with a
  self-drive-or-request-an-agent fork that feeds the marketplace.

**North Star:** GBV — booked trip value through the platform.

Product source of truth: [`docs/product/Trellis_Product_Charter_PRD.pdf`](docs/product/Trellis_Product_Charter_PRD.pdf).

---

## Live demo

**Live at [tripforge-vert.vercel.app](https://tripforge-vert.vercel.app)** — Vercel + Neon Postgres, real Claude in the planner. Seeded demo accounts (password for all: **`TripForgeDemo!2026`**):

| Role | Sign in | Email | What's on it |
| --- | --- | --- | --- |
| **Agent** — Azure Travel Co | `/sign-in` | `owner@azure-travel-demo.test` | 4 itineraries · a marketplace listing + licenses/ratings · a group departure · media library · trip-request inbox · dashboard + AI builder |
| **Traveler** — Omar Haddad | `/view/sign-in` | `traveler-omar@demo.test` | 3 shared trips (My Trips) · 2 group trips (forming + finalized) · a saved AI plan request · discover + marketplace feeds |

Re-seed the demo data any time (idempotent): `DATABASE_URL=<url> npx tsx apps/web/scripts/seed-demo.ts`.

## Status

Built and **deployed**. Both surfaces work end to end: budget-aware AI planning
(real Claude Haiku), quote-then-book with money-conservation + a markup ledger,
the two-sided marketplace (list / license / white-label / revenue-share), group
trips, and the full traveler surface — all live-verified against the deployed app.

**Not yet a real-transacting MVP.** Two integrations remain before real GBV can
flow: (1) **live supply** — the supply adapter runs on a sandbox / curated
catalog behind the ports-and-adapters boundary; real Booking.com / flight-GDS /
aggregator inventory plugs in there; (2) **payments** — bookings record the money
math but don't charge a card (no payment gateway / merchant-of-record yet). Also
stubbed: premium-identity gating for group trips (v0 self-serve, not real KYC),
and the three-way resale payout (deferred). See the PRD roadmap.

## How this repo is built

TripForge is developed by an autonomous **Kitchen Loop** whose Execute phase
routes feature-sized work through **Spec-Driven Development** (Spec Kit):
`/speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement`. Every
change is governed by three sealed documents:

| Layer | File | Role |
| --- | --- | --- |
| Constitution | `.specify/memory/constitution.md` | Six immutable product principles; every plan passes the Constitution Check |
| Architecture | `docs/architecture/system-architecture.md` | System map + numbered invariants `INV-NNN`; ADRs in `docs/architecture/decisions/` |
| Quality bar | `.kitchenloop/quality-bar.md` | "The Bar" — five domain principles enforced before merge |

Each SDD cycle ends with **live verification** against the built docker image —
a real QA browser journey (Playwright / Playwright MCP), a compose-log scan, and
defects fixed in the same cycle (INV-027). Then a zero-context **UAT evaluator**
re-tests the sealed test card against the live stack.

## Operator control plane

The loop is autonomous but not unsupervised. You steer it through four files:

- **`DIRECTIVE.md`** — your setpoint. Grants autonomy per work class; lists what
  ALWAYS halts (constitution/schema/money-semantics changes, gate changes, push,
  deploy). Only you edit it.
- **`OPERATOR-DESK.md`** — the single asks-channel. When the loop needs you it
  files one row with the exact word to say. A gate not on the desk was not asked.
- **`.kitchenloop/HALT`** — the kill switch. While this file exists, every phase
  refuses to run. The loop creates it (with a reason) when a stop condition
  trips; you delete it to resume. You can create it yourself to stop a batch.
- **Notifications** — the loop actively pings you (macOS desktop + terminal bell,
  and Slack if `KITCHENLOOP_SLACK_WEBHOOK` is set) whenever it files a desk ask
  or trips HALT, so an overnight batch never waits silently.

## Quick start

```bash
cp .env.example .env          # then fill in ANTHROPIC_API_KEY (and optionally the Slack webhook)
docker compose up -d          # postgres + mailpit (loopback-bound); web service joins at seed-0001

# run the autonomous loop
./scripts/kitchenloop/kitchenloop.sh 1     # one iteration
./scripts/kitchenloop/kitchenloop.sh 10    # overnight batch
tail -f .kitchenloop/logs/*.log            # monitor
```

Once the skeleton lands:

```bash
npm test        # L1/L2 tests
npm run lint    # ESLint
```

## Repository map

```text
docs/product/            Charter + PRD (product source of truth)
docs/architecture/       system-architecture.md (invariants) + decisions/ (ADRs)
.specify/                Spec Kit: constitution, templates, scripts
specs/                   feature specs (created per SDD cycle)
scripts/kitchenloop/     the loop engine + phase prompts + lib/
scripts/pr-manager/      PR review/merge pipeline (Codex alignment tribunal)
.claude/skills/          loop phase skills + typescript-clean-architecture policy
.claude/agents/          uat-evaluator, pr-auditor
.kitchenloop/            backlog, quality bar, coverage matrix, state
kitchenloop.yaml         loop configuration
```

## Tech stack (ADR-0001)

TypeScript end to end: Next.js + Expo in a pnpm/turborepo monorepo, tRPC, Better
Auth on Postgres via Drizzle, the official Anthropic SDK (Claude Haiku, tools
defined in code) behind an `LLMPort`, Tailwind + shadcn/ui, docker-compose for
local boot. Open-source / free tooling throughout.

## License

Proprietary — © disrupt-gt. All rights reserved. (Not yet licensed for
distribution.)
