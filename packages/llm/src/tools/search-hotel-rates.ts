// search_hotel_rates — typed Claude tool definition (INV-013): zod input schema
// via the SDK's betaZodTool, one file per tool, wrapping the hotel supply port
// through an INJECTED executor (research D7) — this package never constructs an
// adapter. The input schema mirrors HotelSearchCriteria; the compile-time check
// below keeps the mirror honest without a runtime dependency.
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { HotelOffer, HotelSearchCriteria } from "@tripforge/supply-adapter";
import { serializeOffers } from "./serialize-offers.js";

const searchHotelRatesInput = z.strictObject({
  destination: z.string().min(1).describe("City or area to search"),
  checkIn: z.string().describe("Check-in date, ISO format (YYYY-MM-DD)"),
  checkOut: z.string().describe("Check-out date, ISO format (YYYY-MM-DD)"),
  guests: z.number().int().min(1).describe("Total guests including children"),
});

// The zod mirror must stay assignable to the port criteria type.
const _criteriaCheck: HotelSearchCriteria = {} as z.infer<typeof searchHotelRatesInput>;
void _criteriaCheck;

export function searchHotelRatesTool(search: (criteria: HotelSearchCriteria) => Promise<HotelOffer[]>) {
  return betaZodTool({
    name: "search_hotel_rates",
    description:
      "Search bookable hotel stays (net rates) for a destination and date range. " +
      "Returns offers with an offerId and an exact net price in minor units. " +
      "Call this before proposing any stay; only propose offerIds it returned.",
    inputSchema: searchHotelRatesInput,
    run: async (input) => serializeOffers(await search(input), (o) => ({ features: o.content.features })),
  });
}
