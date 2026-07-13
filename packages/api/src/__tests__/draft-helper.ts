// Shared test helper (spec 016; spec 019 multi-option): workspace.itinerary.draft
// is now a compare-only SSE subscription that persists nothing (see
// contracts/itinerary-draft-subscription.md) — persistence moved to the new
// workspace.itinerary.selectDraft subscription (contracts/select-draft-
// subscription.md). Every L3 suite that uses "draft" purely as fixture setup
// (book/list/media/marketplace/client-view) wants the SAME persisted
// terminal-outcome shape it got before spec 019; this helper goes straight to
// selectDraft with the "balanced" variant — byte-for-byte the pre-spec-019
// single-draft selection logic (spec 019 research.md D2) — so every existing
// fixture assertion (which hotel/activity was picked, etc.) keeps working
// unchanged, and exactly ONE LLMPort.draftItinerary() call happens per
// draftViaCaller invocation (preserving scripted plannerScripts sequencing).
import { appRouter } from "../routers/root.js";
import type { DraftOutcome } from "../services/planner.js";

type AppCaller = ReturnType<(typeof appRouter)["createCaller"]>;
type DraftCallerInput = Parameters<AppCaller["workspace"]["itinerary"]["draft"]>[0];

export async function draftViaCaller(caller: AppCaller, input: DraftCallerInput): Promise<DraftOutcome> {
  const stream = await caller.workspace.itinerary.selectDraft({ tripRequest: input, variant: "balanced" });
  let outcome: DraftOutcome | undefined;
  for await (const event of stream) {
    if (event.type === "result") {
      outcome = event.outcome;
    }
  }
  if (!outcome) {
    throw new Error("workspace.itinerary.selectDraft stream ended without a terminal result event");
  }
  return outcome;
}
