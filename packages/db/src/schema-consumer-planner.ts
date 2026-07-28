// Consumer plan request domain module (spec 038: consumer chat-first AI planner
// — the request-an-agent fork). A signed-in traveler self-plans a live-priced
// trip and asks an agent to arrange/book it; this durable, AGENCY-LESS lead
// carries the demand into the network (Constitution Principle I — feed the
// marketplace). Bolt-on side record — NOT a canonical itinerary schema change
// (Constitution IV) — the same pattern as trip_handoff_request/group_departure.
// NOT a money path: no net-rate/markup/take-rate/revenue-share columns — the
// traveler's own budget is the money context; the agent re-quotes for real when
// they pick the lead up (spec 022's classification). agency-less by design: a
// from-scratch consumer plan has no owning agency (attributing one would be an
// operator ownership/revenue decision — ALWAYS-HALT, DIRECTIVE §2).
import { pgTable, text, integer, timestamp, uuid, index } from "drizzle-orm/pg-core";
// See schema.ts for why this sibling import omits the `.js` extension.
import { user } from "./schema-auth";
import { moneyMinor } from "./schema-columns";

export const consumerPlanRequest = pgTable(
  "consumer_plan_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The requesting traveler (Better Auth user); the row dies with the user.
    travelerUserId: text("traveler_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Authoritative trip criteria from the resolved TripRequest.
    destination: text("destination").notNull(),
    checkIn: text("check_in").notNull(), // ISO YYYY-MM-DD
    checkOut: text("check_out").notNull(), // ISO YYYY-MM-DD
    adults: integer("adults").notNull(),
    children: integer("children").notNull(),
    // The traveler's OWN budget — the money context (not a net rate / markup).
    budgetAmountMinor: moneyMinor("budget_amount_minor"),
    budgetCurrency: text("budget_currency").notNull(),
    budgetMode: text("budget_mode").notNull(), // hardCap | target
    // The option the traveler picked — variant + display title (a label, not a price).
    variant: text("variant").notNull(), // budgetSavvy | balanced | premium
    optionTitle: text("option_title").notNull(),
    // Who the agent contacts.
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email"),
    notes: text("notes"),
    status: text("status").notNull(), // new (only value in v0; agent inbox/accept deferred)
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // "My requests" (and the deferred agent-network inbox) query by traveler,
    // newest-first.
    travelerCreatedIdx: index("consumer_plan_request_traveler_created_idx").on(
      table.travelerUserId,
      table.createdAt,
    ),
  }),
);
