// L2 contract instantiation: car-rental sandbox against the shared port contract.
import { SANDBOX_FAIL_BOOK_OFFER_ID } from "../sandbox/engine.js";
import { SandboxCarRentalAdapter } from "../sandbox/car-rental.js";
import { describeSupplyPortContract } from "./contract-suite.js";

describeSupplyPortContract("car rental (sandbox)", {
  makePort: (now) => new SandboxCarRentalAdapter(now),
  failBookOfferId: SANDBOX_FAIL_BOOK_OFFER_ID,
  searchCriteria: {
    pickupLocation: "Lisbon Airport",
    pickupAt: "2026-09-01T10:00:00Z",
    dropoffAt: "2026-09-05T10:00:00Z",
    driverAge: 32,
  },
  emptySearchCriteria: {
    pickupLocation: "",
    pickupAt: "2026-09-01T10:00:00Z",
    dropoffAt: "2026-09-05T10:00:00Z",
  },
});
