// Quote-then-book orchestration (spec 005 US2/US3; contracts §3–4) — barrel
// re-exporting the split submodules (QS3-5, quality-sweep-iter-3.md finding
// 5): booking/quote.ts, booking/book.ts, booking/claims.ts (hold-persistence,
// internal to the book flow), booking/overview.ts, and booking/shared.ts
// (tenant-scoped itinerary load + supply-port lookup, shared by all three).
export { quoteInputSchema, quoteItinerary, type HeldQuote } from "./booking/quote.js";
export { bookInputSchema, bookItinerary, type BookOutcome } from "./booking/book.js";
export { itineraryOverview } from "./booking/overview.js";
export type { BookingActor } from "./booking/actor.js";
export {
  selfBookItinerary,
  type SelfBookOutcome,
  type SelfBookLeg,
  type SelfBookFailureReason,
} from "./booking/self-book.js";
