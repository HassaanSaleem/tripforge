// The tenant scope the money path actually uses. Both the agent path and the
// traveler self-drive path (spec 036) run the SAME quote-then-book services;
// they differ only in HOW this scope is obtained — an agent's proven
// `AgentSessionContext`, or a traveler's `{ agencyId (from the share link),
// userId }`. Widening the service parameter to exactly the two fields the
// services read (`agencyId` for the tenant/INV-004 filter and logging;
// `userId` for the `pmf_event.actor_user_id` on book) keeps the agent path an
// exact structural supertype (zero behavior change) while letting a traveler
// book without a fictional `agencyRole` they don't hold (spec 036 research D2).
import type { AgentSessionContext } from "../../context.js";

/** Who the money path books for: the owning agency (tenant) + the acting user. */
export type BookingActor = Pick<AgentSessionContext, "agencyId" | "userId">;
