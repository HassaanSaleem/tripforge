// search_activities — typed Claude tool definition (INV-013) wrapping the
// activity supply port through an injected executor (research D7).
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ActivityOffer, ActivitySearchCriteria } from "@tripforge/supply-adapter";

export const searchActivitiesInput = z.strictObject({
  destination: z.string().min(1).describe("City or area to search"),
  date: z.string().optional().describe("ISO date the activity should take place; omit for date-flexible"),
  participants: z.number().int().min(1).describe("Number of participants"),
});

const _criteriaCheck: ActivitySearchCriteria = {} as z.infer<typeof searchActivitiesInput>;
void _criteriaCheck;

export function serializeActivityOffers(offers: ActivityOffer[]): string {
  return JSON.stringify(
    offers.map((o) => ({
      offerId: o.offerId,
      title: o.content.title,
      netAmountMinor: o.netRate.amountMinor,
      currency: o.netRate.currency,
      durationMinutes: o.durationMinutes,
    })),
  );
}

export function searchActivitiesTool(search: (criteria: ActivitySearchCriteria) => Promise<ActivityOffer[]>) {
  return betaZodTool({
    name: "search_activities",
    description:
      "Search bookable activities and tickets for a destination. Returns offers " +
      "with an offerId and an exact net price in minor units. Only propose " +
      "activity offerIds this tool returned.",
    inputSchema: searchActivitiesInput,
    run: async (input) => serializeActivityOffers(await search(input)),
  });
}
