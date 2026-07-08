// L2 contract instantiation: activity sandbox against the shared port contract.
import { SANDBOX_FAIL_BOOK_OFFER_ID } from "../sandbox/engine.js";
import { SandboxActivityAdapter } from "../sandbox/activity.js";
import { describeSupplyPortContract } from "./contract-suite.js";

describeSupplyPortContract("activity (sandbox)", {
  makePort: (now) => new SandboxActivityAdapter(now),
  failBookOfferId: SANDBOX_FAIL_BOOK_OFFER_ID,
  searchCriteria: {
    destination: "Lisbon",
    date: "2026-09-02",
    participants: 2,
  },
  emptySearchCriteria: {
    destination: "",
    participants: 2,
  },
});
