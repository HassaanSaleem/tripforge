// QUOTE flow (spec 005 US2; contract §3): per bookable item — port quote
// (firm hold), explicit conversion into the itinerary currency (rate
// recorded — FR-008), pure markup math (INV-010), server-persisted hold row
// (FR-009). Per-item failures never abort siblings.
import { applyMarkupBps, convertMoney, type Money } from "@tripforge/domain";
import {
  eq,
  bookingComponent as bookingComponentTable,
  bookingQuote as bookingQuoteTable,
  scopedWhere,
} from "@tripforge/db";
import { z } from "zod";
import type { AgentSessionContext, Container } from "../../context.js";
import { findRate } from "../../rates.js";
import { verifiedSupplyCatalog } from "../planner.js";
import { logger, loadItinerary, portFor } from "./shared.js";

export const quoteInputSchema = z.strictObject({
  itineraryId: z.uuid(),
  markupBps: z.number().int().min(0).max(10_000).default(1500),
});
type QuoteInput = z.infer<typeof quoteInputSchema>;

export interface HeldQuote {
  quoteRowId: string;
  netMinor: number;
  netCurrency: string;
  rate?: { numerator: number; denominator: number };
  sellMinor: number;
  currency: string;
  markupBps: number;
  merchantOfRecord: string;
  expiresAt: string;
}

type QuoteItemOutcome =
  | { itemId: string; outcome: "held"; quote: HeldQuote }
  | { itemId: string; outcome: "failed"; reason: "unknown_offer" | "no_rate" | "already_booked" };

export async function quoteItinerary(
  container: Container,
  session: AgentSessionContext,
  input: QuoteInput,
): Promise<{ status: "not_found" } | { status: "quoted"; items: QuoteItemOutcome[] }> {
  const db = container.db;
  if (!db) throw new Error("database not configured");
  const row = await loadItinerary(container, session, input.itineraryId);
  if (!row) return { status: "not_found" };

  // Re-register supply state from the persisted request so quoting works in a
  // fresh process too (research D6) — idempotent against the sandbox engines.
  await verifiedSupplyCatalog(container, row.tripRequest);

  const alreadyBooked = new Set(
    (
      await db
        .select({ itemId: bookingComponentTable.itemId })
        .from(bookingComponentTable)
        .where(scopedWhere(bookingComponentTable.agencyId, session.agencyId, eq(bookingComponentTable.itineraryId, row.id)))
    ).map((r) => r.itemId),
  );

  const bookable = row.document.days.flatMap((day) =>
    day.items.flatMap((item) => (item.supplyRef ? [{ itemId: item.id, supplyRef: item.supplyRef }] : [])),
  );

  const outcomes: QuoteItemOutcome[] = [];
  const rowsToInsert: (typeof bookingQuoteTable.$inferInsert)[] = [];

  for (const { itemId, supplyRef } of bookable) {
    if (alreadyBooked.has(itemId)) {
      outcomes.push({ itemId, outcome: "failed", reason: "already_booked" });
      continue;
    }
    const port = portFor(container, supplyRef.port);
    if (!port) {
      outcomes.push({ itemId, outcome: "failed", reason: "unknown_offer" });
      continue;
    }
    const quoted = await port.quote(supplyRef.externalId);
    if (quoted.status === "failed") {
      outcomes.push({ itemId, outcome: "failed", reason: "unknown_offer" });
      continue;
    }
    const quote = quoted.quote;

    let convertedNet: Money;
    let rate: { numerator: number; denominator: number } | undefined;
    if (quote.netRate.currency === row.document.currency) {
      convertedNet = quote.netRate;
    } else {
      const found = findRate(container.rates, quote.netRate.currency, row.document.currency);
      if (!found) {
        outcomes.push({ itemId, outcome: "failed", reason: "no_rate" });
        continue;
      }
      convertedNet = convertMoney(quote.netRate, found);
      rate = { numerator: found.numerator, denominator: found.denominator };
      // Conversions are explicit, logged operations (INV-009).
      logger.info("booking.quote.currency_conversion", {
        agencyId: session.agencyId,
        itineraryId: row.id,
        itemId,
        from: quote.netRate.currency,
        to: row.document.currency,
        amountMinor: quote.netRate.amountMinor,
        convertedMinor: convertedNet.amountMinor,
        rateNumerator: found.numerator,
        rateDenominator: found.denominator,
      });
    }

    const sell = applyMarkupBps(convertedNet, input.markupBps);
    rowsToInsert.push({
      agencyId: session.agencyId,
      itineraryId: row.id,
      itemId,
      port: supplyRef.port,
      offerId: supplyRef.externalId,
      supplierQuoteId: quote.quoteId,
      netMinor: quote.netRate.amountMinor,
      netCurrency: quote.netRate.currency,
      rateNumerator: rate?.numerator,
      rateDenominator: rate?.denominator,
      convertedNetMinor: convertedNet.amountMinor,
      markupBps: input.markupBps,
      sellMinor: sell.amountMinor,
      currency: row.document.currency,
      merchantOfRecord: quote.merchantOfRecord,
      expiresAt: new Date(quote.expiresAt),
    });
    outcomes.push({
      itemId,
      outcome: "held",
      quote: {
        quoteRowId: "", // filled from the insert below
        netMinor: quote.netRate.amountMinor,
        netCurrency: quote.netRate.currency,
        rate,
        sellMinor: sell.amountMinor,
        currency: row.document.currency,
        markupBps: input.markupBps,
        merchantOfRecord: quote.merchantOfRecord,
        expiresAt: quote.expiresAt,
      },
    });
  }

  if (rowsToInsert.length > 0) {
    const inserted = await db.insert(bookingQuoteTable).values(rowsToInsert).returning({
      id: bookingQuoteTable.id,
      itemId: bookingQuoteTable.itemId,
    });
    const idByItem = new Map(inserted.map((r) => [r.itemId, r.id]));
    for (const outcome of outcomes) {
      if (outcome.outcome === "held") {
        outcome.quote.quoteRowId = idByItem.get(outcome.itemId) ?? "";
      }
    }
  }

  return { status: "quoted", items: outcomes };
}
