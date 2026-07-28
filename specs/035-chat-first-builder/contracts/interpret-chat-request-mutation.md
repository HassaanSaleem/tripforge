# Contract: `workspace.itinerary.interpretChatRequest` (multi-turn)

**Type**: tRPC mutation (agent-gated). **Change from spec 028**: input gains an optional `priorMessages`; output shape unchanged.

## Input

```ts
z.strictObject({
  message: z.string().min(1),                       // latest turn (unchanged)
  priorMessages: z.array(z.string().min(1)).max(20).optional(), // earlier turns, oldest first (NEW)
})
```

- Absent/empty `priorMessages` ⇒ byte-identical to spec 028 single-shot behaviour.
- Server interprets the JOINED transcript `[...priorMessages, message]` (D1).

## Output (unchanged from spec 028)

```ts
| { status: "resolved"; tripRequest: TripRequest }
| { status: "needsInfo"; reply: string }
| { status: "failed"; reason: "malformed_output" }
```

## Behaviour

| Given (accumulated transcript) | Then |
|--------------------------------|------|
| Destination + budget identifiable across the turns | `resolved` with a full `TripRequest` (unstated fields defaulted). Client shows a confirmation + "Build my trip". |
| Destination missing after all turns | `needsInfo` asking for a destination. No draft. |
| Budget missing after all turns | `needsInfo` asking for a budget. No draft. |
| Unrelated message(s) only | `needsInfo` explaining it can start a trip given a destination + budget. No draft. |
| LLM output fails validation | `failed: malformed_output`. |

## RBAC (unchanged — INV-023/024)

| Caller | Result |
|--------|--------|
| Anonymous (no session) | throws `UNAUTHORIZED` |
| Authenticated non-agent (traveler) | throws `FORBIDDEN` |
| Authenticated agent | interprets on the caller's own agency only (INV-004) |

## Guarantees

- **No supply search** runs during interpretation (unchanged — plain mutation, not a subscription).
- **No itinerary content trusted**: the resolved `tripRequest` is a *request*; the actual draft re-prices against live supply via the unchanged `draft`/`selectDraft` subscriptions (FR-008).
- **Deterministic keyless**: same transcript ⇒ same output under FakeLLM, zero network calls (SC-004).

## Downstream (unchanged)

`resolved.tripRequest` → client `startDraft(tripRequest)` → `workspace.itinerary.draft` (compare) → `selectDraft` (persist) → `workspace.booking.*` (book) → `chatEdit` (refine). No new procedure; no forked pipeline (FR-004).
