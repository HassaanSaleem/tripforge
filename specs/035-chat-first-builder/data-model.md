# Data Model: Chat-First, Multi-Turn Build-to-Book

**No persisted data-model change. No canonical-schema change. No migration.** (FR-012.)

This feature introduces no new database entity and mutates no stored document. The only "entities" are transient, request/session-scoped shapes.

## Transient entities

### Chat Conversation (transcript) — session-scoped, client only

| Field | Type | Notes |
|-------|------|-------|
| turns | `string[]` | The agent's own chat messages in this unstarted build, oldest first. React state in `chat-entry.tsx`; never persisted. |
| resolvedRequest | `DraftInput \| null` | The most recently resolved trip request awaiting the "Build my trip" confirmation. Cleared/replaced when a newer turn re-interprets. |

The transcript is sent to the server per turn as `{ message, priorMessages }`; the server never stores it.

### interpretChatRequest input *(changed — additive)*

| Field | Type | Notes |
|-------|------|-------|
| message | `string` (min 1) | The latest turn (unchanged). |
| priorMessages | `string[]` (each min 1, max 20 items) **optional** | Earlier turns, oldest first. Absent/`[]` ⇒ identical to today's single-shot behaviour. |

### InterpretChatOutcome *(existing, reused — unchanged shape)*

`{ status: "resolved"; tripRequest: TripRequest } | { status: "needsInfo"; reply: string } | { status: "failed"; reason: "malformed_output" }`

The service builds this exactly as today; only the *input text* fed to the LLM changes (joined transcript instead of a single message).

### Resolved Trip Request *(existing, reused — `TripRequest`/`DraftInput`)*

Unchanged in shape and meaning. It is a *request*, not itinerary content — every saved price/item still comes from the live supply pipeline via the unchanged `draft`/`selectDraft` procedures.

## Invariants preserved

- **INV-004 / INV-023 / INV-024**: `interpretChatRequest` stays `agentProcedure` — anon ⇒ UNAUTHORIZED, non-agent traveler ⇒ FORBIDDEN; acts only on the session's own agency.
- **Canonical schema (Principle IV)**: `SCHEMA_VERSION` unchanged; no document field added or migrated.
- **Money paths (Principle VI)**: markup/net-rate/take-rate/revenue-share code untouched; no ledger write from this path.
- **Determinism (SC-004)**: interpretation output is a pure function of the transcript string under FakeLLM (no wall-clock/random in the interpreter; dates resolved above the LLM as before).
