// License/receipt-flow section of the marketplace panel — the confirmation
// shown right after a successful license, split out of marketplace-panel.tsx
// (file-length quality-sweep, QS3-9).
import { formatMinorAmount } from "../../../lib/planner-form.js";
import type { LicenseState } from "./marketplace-panel-types.js";

export function LicenseReceiptPanel({
  state,
}: {
  state: Extract<NonNullable<LicenseState>, { kind: "receipt" }>;
}) {
  const { receipt, title } = state;
  return (
    <div data-testid="license-receipt" className="tf-confirmation tf-confirmation--ok tf-market-receipt">
      <h3>Trip licensed — white-label copy created</h3>
      <p>
        “{title}” is now in your workspace as a white-label copy under your brand, with its
        provenance and revenue-share terms travelling inside it.
      </p>
      <ul>
        <li>
          <span>License fee</span>
          <span className="tf-price">{formatMinorAmount(receipt.priceMinor, receipt.currency)}</span>
        </li>
        <li>
          <span>Seller credit</span>
          <span className="tf-price">{formatMinorAmount(receipt.sellerCreditMinor, receipt.currency)}</span>
        </li>
        <li>
          <span>Platform take</span>
          <span className="tf-price">{formatMinorAmount(receipt.platformTakeMinor, receipt.currency)}</span>
        </li>
      </ul>
      <p className="tf-confirmation-note">
        Copy reference: <code>{receipt.copyItineraryId}</code>
      </p>
    </div>
  );
}
