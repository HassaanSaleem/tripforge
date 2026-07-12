// Shared compact, supplier-agnostic offer serialization for the model's
// context (INV-013): the {offerId, title, netAmountMinor, currency}
// projection every search/quote tool needs, plus an optional per-offer-type
// extra-field callback for the one differentiator each tool adds
// (features/durationMinutes/mode/vehicleClass).
import type { OfferBase } from "@tripforge/supply-adapter";

export function serializeOffers<TOffer extends OfferBase>(
  offers: TOffer[],
  extra: (offer: TOffer) => Record<string, unknown> = () => ({}),
): string {
  return JSON.stringify(
    offers.map((o) => ({
      offerId: o.offerId,
      title: o.content.title,
      netAmountMinor: o.netRate.amountMinor,
      currency: o.netRate.currency,
      ...extra(o),
    })),
  );
}
