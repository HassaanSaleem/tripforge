// quote_transfer — typed Claude tool definition (INV-013) wrapping the transfer
// supply port through an injected executor (research D7). "Quote" here is the
// planner's vocabulary: the supplier's quotable price for a leg (priced offers);
// firm holds are created later by the booking flow's port quote() calls.
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { TransferOffer, TransferSearchCriteria } from "@tripforge/supply-adapter";

export const quoteTransferInput = z.strictObject({
  from: z.string().min(1).describe("Pickup location"),
  to: z.string().min(1).describe("Drop-off location"),
  at: z.string().describe("Pickup ISO datetime"),
  passengers: z.number().int().min(1).describe("Number of passengers"),
});

const _criteriaCheck: TransferSearchCriteria = {} as z.infer<typeof quoteTransferInput>;
void _criteriaCheck;

export function serializeTransferOffers(offers: TransferOffer[]): string {
  return JSON.stringify(
    offers.map((o) => ({
      offerId: o.offerId,
      title: o.content.title,
      netAmountMinor: o.netRate.amountMinor,
      currency: o.netRate.currency,
      mode: o.mode,
    })),
  );
}

export function quoteTransferTool(search: (criteria: TransferSearchCriteria) => Promise<TransferOffer[]>) {
  return betaZodTool({
    name: "quote_transfer",
    description:
      "Price transfer / private-driver options for a leg (licensed third-party " +
      "providers). Returns offers with an offerId and an exact net price in " +
      "minor units. Only propose transfer offerIds this tool returned.",
    inputSchema: quoteTransferInput,
    run: async (input) => serializeTransferOffers(await search(input)),
  });
}
