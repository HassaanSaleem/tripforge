// L2 contract instantiation: hotel sandbox against the shared port contract.
import { SANDBOX_FAIL_BOOK_OFFER_ID } from "../sandbox/engine.js";
import { SandboxHotelAdapter } from "../sandbox/hotel.js";
import { describeSupplyPortContract } from "./contract-suite.js";

describeSupplyPortContract("hotel (sandbox)", {
  makePort: (now) => new SandboxHotelAdapter(now),
  failBookOfferId: SANDBOX_FAIL_BOOK_OFFER_ID,
  searchCriteria: {
    destination: "Lisbon",
    checkIn: "2026-09-01",
    checkOut: "2026-09-05",
    guests: 2,
  },
  emptySearchCriteria: {
    destination: "   ",
    checkIn: "2026-09-01",
    checkOut: "2026-09-05",
    guests: 2,
  },
});
