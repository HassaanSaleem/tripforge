// Shared test helper (spec 016): workspace.itinerary.draft is now a streamed
// SSE subscription — a server-side caller resolves to Promise<AsyncGenerator
// of DraftEvent>, not Promise<DraftOutcome> (see contracts/itinerary-draft-
// subscription.md). Every L3 suite that uses draft purely as fixture setup
// (book/list/media/marketplace/client-view) wants the SAME terminal-outcome
// shape it got before this feature; this helper drains the stream so those
// call sites do not each re-implement the drain loop.
import { appRouter } from "../routers/root.js";
import type { DraftOutcome } from "../services/planner.js";

type AppCaller = ReturnType<(typeof appRouter)["createCaller"]>;
type DraftCallerInput = Parameters<AppCaller["workspace"]["itinerary"]["draft"]>[0];

export async function draftViaCaller(caller: AppCaller, input: DraftCallerInput): Promise<DraftOutcome> {
  const stream = await caller.workspace.itinerary.draft(input);
  let outcome: DraftOutcome | undefined;
  for await (const event of stream) {
    if (event.type === "result") {
      outcome = event.outcome;
    }
  }
  if (!outcome) {
    throw new Error("workspace.itinerary.draft stream ended without a terminal result event");
  }
  return outcome;
}
