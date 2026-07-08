// L2 contract instantiation: transfer sandbox against the shared port contract.
import { SANDBOX_FAIL_BOOK_OFFER_ID } from "../sandbox/engine.js";
import { SandboxTransferAdapter } from "../sandbox/transfer.js";
import { describeSupplyPortContract } from "./contract-suite.js";

describeSupplyPortContract("transfer (sandbox)", {
  makePort: (now) => new SandboxTransferAdapter(now),
  failBookOfferId: SANDBOX_FAIL_BOOK_OFFER_ID,
  searchCriteria: {
    from: "LIS Airport",
    to: "Baixa",
    at: "2026-09-01T14:30:00Z",
    passengers: 2,
  },
  emptySearchCriteria: {
    from: "",
    to: "Baixa",
    at: "2026-09-01T14:30:00Z",
    passengers: 2,
  },
});
