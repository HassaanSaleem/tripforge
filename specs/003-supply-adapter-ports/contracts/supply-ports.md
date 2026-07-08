# Contract: Supply Port Family (public surface of `@tripforge/supply-adapter`)

The package's `index.ts` is the contract; nothing outside the package may
import deeper paths. Consumers: `packages/api` (composition root + handlers),
later `packages/llm` tool definitions (INV-013) and `packages/marketplace`.

## Exported types (compile-time contract)

```ts
// ports/common.ts
export type MerchantOfRecord = "platform" | "agency" | "supplier";
export interface SupplyContent { title: string; description?: string; features?: string[] }
export type QuoteFailureReason = "unknown_offer";
export type BookFailureReason = "quote_expired" | "supplier_rejected" | "unknown_quote";
export type CancelFailureReason = "unknown_booking" | "already_cancelled";
export type QuoteOutcome<TQuote> =
  | { status: "quoted"; quote: TQuote }
  | { status: "failed"; reason: QuoteFailureReason };
export interface SupplyBooking { bookingId: string; quoteId: string }
export type BookingOutcome =
  | { status: "confirmed"; booking: SupplyBooking }
  | { status: "failed"; quoteId: string; reason: BookFailureReason };
export type CancelOutcome =
  | { status: "cancelled"; bookingId: string }
  | { status: "failed"; bookingId: string; reason: CancelFailureReason };
export interface OfferBase { offerId: string; content: SupplyContent; netRate: Money }
export interface QuoteBase {
  quoteId: string; offerId: string; netRate: Money;
  expiresAt: string; merchantOfRecord: MerchantOfRecord;
}
export interface SupplyPort<TCriteria, TOffer extends OfferBase, TQuote extends QuoteBase> {
  search(criteria: TCriteria): Promise<TOffer[]>;
  quote(offerId: string): Promise<QuoteOutcome<TQuote>>;
  book(quoteId: string): Promise<BookingOutcome>;
  cancel(bookingId: string): Promise<CancelOutcome>;
}
```

Per-component: `HotelPort` / `ActivityPort` / `TransferPort` / `CarRentalPort`
with their criteria/offer/quote types (see data-model.md), plus sandbox
adapters `SandboxHotelAdapter` / `SandboxActivityAdapter` /
`SandboxTransferAdapter` / `SandboxCarRentalAdapter` (each
`new (now?: () => number)`) and the fixture constant
`SANDBOX_FAIL_BOOK_OFFER_ID`.

Removed from the surface (upgraded in place, callsites: none outside the
package): `HotelBooking` (superseded by `BookingOutcome`), `HotelOffer.name`
(superseded by `content.title`).

## Behavioral contract (what `describeSupplyPortContract` pins for EVERY implementation)

1. **search** returns a deterministic, non-empty offer list for the sandbox's
   known criteria; every offer has `offerId`, `content.title`, and `netRate`
   with integer `amountMinor` and non-empty `currency`. Unknown criteria →
   empty list, never a throw.
2. **quote** on a searched offer returns `quoted` with: same `offerId`, a firm
   `netRate`, `expiresAt` strictly in the future, and a `merchantOfRecord`
   from the closed set. Unknown offerId → `failed(unknown_offer)`.
3. **book** before expiry → `confirmed` with a booking referencing the quote.
4. **book** at/after expiry (fake clock advanced) → `failed(quote_expired)`;
   a subsequent `quote` of the same offer succeeds with a fresh hold
   (re-quote path, INV-006).
5. **book** of the same quote twice → the identical recorded outcome; exactly
   one booking ever exists per quote (idempotency, no double-book).
6. **book** of an unknown quoteId → `failed(unknown_quote)`.
7. **book** of a quote on `SANDBOX_FAIL_BOOK_OFFER_ID` →
   `failed(supplier_rejected)`.
8. **cancel** of a confirmed booking → `cancelled`; again →
   `failed(already_cancelled)`; unknown id → `failed(unknown_booking)`.
9. **independence** (INV-007): after one component's `failed` booking, a
   sibling quote (same or different port instance) still books successfully
   within its hold.
10. **no implicit conversion**: outcomes never change a `currency`; mixed-
    currency carts see each component's own currency untouched (INV-009).

The suite is a single exported helper
(`packages/supply-adapter/src/__tests__/contract-suite.ts`) parameterized by a
harness `{ makePort(clock), searchCriteria, failBookCriteria? }`; the four
sandbox `.contract.test.ts` files instantiate it. A future real adapter must
pass the same suite unchanged (FR-008/FR-009).
