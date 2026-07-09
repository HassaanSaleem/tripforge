// quote_car_rental — typed Claude tool definition (INV-013) wrapping the car
// rental supply port through an injected executor (research D7). D-006 boundary:
// canonical schema v0 has NO carRental item kind — this tool gives the planner
// price CONTEXT only and its offers never become itinerary items.
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { CarRentalOffer, CarRentalSearchCriteria } from "@tripforge/supply-adapter";

const quoteCarRentalInput = z.strictObject({
  pickupLocation: z.string().min(1).describe("Pickup location"),
  dropoffLocation: z.string().min(1).optional().describe("Drop-off location; omit for round-trip"),
  pickupAt: z.string().describe("Pickup ISO datetime"),
  dropoffAt: z.string().describe("Drop-off ISO datetime"),
  driverAge: z.number().int().min(18).optional().describe("Driver age if under 30 or over 65"),
});

const _criteriaCheck: CarRentalSearchCriteria = {} as z.infer<typeof quoteCarRentalInput>;
void _criteriaCheck;

function serializeCarRentalOffers(offers: CarRentalOffer[]): string {
  return JSON.stringify(
    offers.map((o) => ({
      offerId: o.offerId,
      title: o.content.title,
      netAmountMinor: o.netRate.amountMinor,
      currency: o.netRate.currency,
      vehicleClass: o.vehicleClass,
    })),
  );
}

export function quoteCarRentalTool(search: (criteria: CarRentalSearchCriteria) => Promise<CarRentalOffer[]>) {
  return betaZodTool({
    name: "quote_car_rental",
    description:
      "Price car rental options (context for local-transport budgeting ONLY — " +
      "car rentals cannot be added to the itinerary in this version, so never " +
      "propose these offerIds as itinerary items).",
    inputSchema: quoteCarRentalInput,
    run: async (input) => serializeCarRentalOffers(await search(input)),
  });
}
