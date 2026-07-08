// Public surface of @tripforge/supply-adapter. Exposes PORT TYPES + the sandbox
// implementations + the deterministic fail-book fixture id. No supplier API shape
// crosses this boundary (INV-005); the lifecycle engine stays internal.
export type {
  MerchantOfRecord,
  SupplyContent,
  QuoteFailureReason,
  BookFailureReason,
  CancelFailureReason,
  QuoteOutcome,
  SupplyBooking,
  BookingOutcome,
  CancelOutcome,
  OfferBase,
  QuoteBase,
  SupplyPort,
} from "./ports/common.js";
export type { HotelPort, HotelSearchCriteria, HotelOffer, HotelQuote } from "./ports/hotel.js";
export type {
  ActivityPort,
  ActivitySearchCriteria,
  ActivityOffer,
  ActivityQuote,
} from "./ports/activity.js";
export type {
  TransferPort,
  TransferSearchCriteria,
  TransferOffer,
  TransferQuote,
} from "./ports/transfer.js";
export type {
  CarRentalPort,
  CarRentalSearchCriteria,
  CarRentalOffer,
  CarRentalQuote,
} from "./ports/car-rental.js";
export { SandboxHotelAdapter } from "./sandbox/hotel.js";
export { SandboxActivityAdapter } from "./sandbox/activity.js";
export { SandboxTransferAdapter } from "./sandbox/transfer.js";
export { SandboxCarRentalAdapter } from "./sandbox/car-rental.js";
export { SANDBOX_FAIL_BOOK_OFFER_ID } from "./sandbox/engine.js";
