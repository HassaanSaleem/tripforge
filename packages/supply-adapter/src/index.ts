// Public surface of @tripforge/supply-adapter. Exposes PORT TYPES + the sandbox
// implementation. No supplier API shape crosses this boundary (INV-005).
export type {
  HotelPort,
  HotelSearchCriteria,
  HotelOffer,
  HotelQuote,
  HotelBooking,
} from "./ports/hotel.js";
export { SandboxHotelAdapter } from "./sandbox/hotel.js";
