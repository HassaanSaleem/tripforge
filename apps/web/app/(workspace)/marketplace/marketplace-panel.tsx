// Marketplace panel (spec 011 contracts §3–§5) — client component driving the
// EXISTING agent-gated workspace.marketplace procedures plus the new
// workspace.itinerary.list picker read through the typed browser tRPC client
// (research D1). Renders listings, receipts, and splits exactly as returned —
// the page performs no money arithmetic (FR-003); the only numeric input
// conversions live in the pure mapping helpers (fee major→minor, share
// percent→bps), and every user-visible failure string comes from
// marketplace-flow.ts (FR-009). Browse state is reloaded from the server after
// each successful action (FR-011, research D6) — no optimistic marketplace
// state is ever invented client-side. Presentation rides the seed-0009s theme
// kit (.tf-*).
"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { trpc, type MyItinerariesOutput } from "../../../lib/trpc/client.js";
import { formatMinorAmount } from "../../../lib/planner-form.js";
import {
  createListingFailureMessage,
  formatEarnings,
  formatRating,
  formatShareBps,
  licenseFailureMessage,
  marketplaceErrorMessage,
  toCreateListingInput,
  type LicenseReceipt,
  type ListingFormValues,
  type MarketplaceListing,
} from "../../../lib/marketplace-flow.js";

type MyItinerary = MyItinerariesOutput["itineraries"][number];

type BrowseState =
  | { phase: "loading" }
  | { phase: "loaded"; listings: MarketplaceListing[] }
  | { phase: "failed"; message: string };

type PickerState =
  | { phase: "loading" }
  | { phase: "loaded"; itineraries: MyItinerary[] }
  | { phase: "failed"; message: string };

type ListingFormState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "listed" }
  | { phase: "refused"; message: string };

type LicenseState =
  | { listingId: string; kind: "busy" }
  | { listingId: string; kind: "receipt"; receipt: LicenseReceipt; title: string }
  | { listingId: string; kind: "refused"; message: string }
  | null;

const INITIAL_FORM: ListingFormValues = {
  itineraryId: "",
  title: "",
  feeMajor: "",
  licenseTerms: "",
  sharePercent: "10",
};

/**
 * Read the listing form's values from the DOM at submit time. Some real input
 * paths (browser autofill, password managers, automation fills) set a field's
 * value without the events a controlled input needs, so React state can lag
 * what the seller actually sees — and a refusal re-render would then silently
 * snap a declared term (e.g. the revenue share) back to its default
 * (seed-0009d-b, Constitution VI: the recorded split must match the declared
 * terms). The DOM is what the seller saw when they pressed submit.
 */
function readListingFormValues(form: HTMLFormElement): ListingFormValues {
  const read = (name: string): string => {
    const field = form.elements.namedItem(name);
    return field instanceof HTMLInputElement ||
      field instanceof HTMLSelectElement ||
      field instanceof HTMLTextAreaElement
      ? field.value
      : "";
  };
  return {
    itineraryId: read("listItineraryId"),
    title: read("listingTitle"),
    feeMajor: read("listingFee"),
    licenseTerms: read("listingTerms"),
    sharePercent: read("listingShare"),
  };
}

export function MarketplacePanel() {
  const [browse, setBrowse] = useState<BrowseState>({ phase: "loading" });
  const [picker, setPicker] = useState<PickerState>({ phase: "loading" });
  const [values, setValues] = useState<ListingFormValues>(INITIAL_FORM);
  const [form, setForm] = useState<ListingFormState>({ phase: "idle" });
  const [license, setLicense] = useState<LicenseState>(null);

  async function loadListings() {
    try {
      const outcome = await trpc.workspace.marketplace.browseListings.query();
      setBrowse({ phase: "loaded", listings: outcome.listings });
    } catch (error) {
      setBrowse({ phase: "failed", message: marketplaceErrorMessage(error) });
    }
  }

  async function loadItineraries() {
    try {
      const outcome = await trpc.workspace.itinerary.list.query();
      setPicker({ phase: "loaded", itineraries: outcome.itineraries });
    } catch (error) {
      setPicker({ phase: "failed", message: marketplaceErrorMessage(error) });
    }
  }

  useEffect(() => {
    void loadListings();
    void loadItineraries();
  }, []);

  function update<K extends keyof ListingFormValues>(field: K, value: ListingFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function currencyOf(itineraryId: string): string {
    return picker.phase === "loaded"
      ? (picker.itineraries.find((itinerary) => itinerary.id === itineraryId)?.currency ?? "")
      : "";
  }

  const pickedCurrency = currencyOf(values.itineraryId);

  async function handleList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.phase === "submitting") return;
    // Submit what the seller SEES: read the DOM, then re-assert it into state
    // so the refusal re-render can't snap an uncommitted field back to its
    // default (seed-0009d-b).
    const submitted = readListingFormValues(event.currentTarget);
    setValues(submitted);
    const mapped = toCreateListingInput(submitted, currencyOf(submitted.itineraryId));
    if ("error" in mapped) {
      setForm({ phase: "refused", message: mapped.error });
      return;
    }
    setForm({ phase: "submitting" });
    try {
      const outcome = await trpc.workspace.marketplace.createListing.mutate(mapped.input);
      if (outcome.status === "listed") {
        setForm({ phase: "listed" });
        setValues(INITIAL_FORM);
        await loadListings();
      } else {
        setForm({ phase: "refused", message: createListingFailureMessage(outcome) });
      }
    } catch (error) {
      setForm({ phase: "refused", message: marketplaceErrorMessage(error) });
    }
  }

  async function handleLicense(listing: MarketplaceListing) {
    if (license?.kind === "busy") return;
    setLicense({ listingId: listing.listingId, kind: "busy" });
    try {
      const outcome = await trpc.workspace.marketplace.licenseListing.mutate({
        listingId: listing.listingId,
      });
      if (outcome.status === "licensed") {
        setLicense({
          listingId: listing.listingId,
          kind: "receipt",
          receipt: outcome,
          title: listing.title,
        });
        // The license just placed a white-label copy in THIS agency's
        // workspace, so the sell-form picker projection is stale too —
        // refresh both server reads in place (FR-011 parity, seed-0016).
        await Promise.all([loadListings(), loadItineraries()]);
      } else {
        setLicense({
          listingId: listing.listingId,
          kind: "refused",
          message: licenseFailureMessage(outcome),
        });
      }
    } catch (error) {
      setLicense({
        listingId: listing.listingId,
        kind: "refused",
        message: marketplaceErrorMessage(error),
      });
    }
  }

  return (
    <div className="tf-market">
      <section className="tf-card" data-testid="marketplace-browse">
        <p className="tf-eyebrow">Live listings</p>
        <h2>On the marketplace now</h2>
        {browse.phase === "loading" ? (
          <p className="tf-drafting" aria-live="polite">
            <span className="tf-spin" aria-hidden="true" />
            Loading live listings…
          </p>
        ) : null}
        {browse.phase === "failed" ? <p role="alert">{browse.message}</p> : null}
        {browse.phase === "loaded" && browse.listings.length === 0 ? (
          <p className="tf-market-empty">
            No trips on the marketplace yet — list one of yours below and be the first.
          </p>
        ) : null}
        {browse.phase === "loaded" && browse.listings.length > 0 ? (
          <div className="tf-market-grid">
            {browse.listings.map((listing) => (
              <ListingCard
                key={listing.listingId}
                listing={listing}
                license={license}
                onLicense={handleLicense}
              />
            ))}
          </div>
        ) : null}
        {license?.kind === "receipt" ? <LicenseReceiptPanel state={license} /> : null}
      </section>

      <section className="tf-card" data-testid="listing-form">
        <p className="tf-eyebrow">Sell a trip</p>
        <h2>List a finished itinerary</h2>
        <p>
          Declare the terms once — the platform stamps them into the itinerary&apos;s
          provenance and enforces your revenue share on every license.
        </p>
        <ListingForm
          picker={picker}
          values={values}
          form={form}
          pickedCurrency={pickedCurrency}
          onUpdate={update}
          onSubmit={handleList}
        />
      </section>
    </div>
  );
}

function ListingCard({
  listing,
  license,
  onLicense,
}: {
  listing: MarketplaceListing;
  license: LicenseState;
  onLicense: (listing: MarketplaceListing) => void;
}) {
  const active = license !== null && license.listingId === listing.listingId;
  const busy = license?.kind === "busy";
  return (
    <article className="tf-market-card" data-testid="listing-card">
      <h3>{listing.title}</h3>
      <p className="tf-market-seller">
        by <b>{listing.sellerAgencyName}</b> · {formatRating(listing.ratingAverage, listing.ratingCount)}
      </p>
      <p className="tf-price tf-market-price">{formatMinorAmount(listing.priceMinor, listing.currency)}</p>
      <div className="tf-market-meta">
        <span className="tf-badge">{formatShareBps(listing.revenueShareBps)} revenue share</span>
        {listing.mine ? <span className="tf-badge tf-market-mine">Your listing</span> : null}
      </div>
      {listing.mine && listing.licenseCount !== null && listing.sellerCreditTotalMinor !== null ? (
        <p className="tf-market-earnings" data-testid="listing-earnings">
          {formatEarnings(listing.licenseCount, listing.sellerCreditTotalMinor, listing.currency)}
        </p>
      ) : null}
      <p className="tf-market-terms">{listing.licenseTerms}</p>
      {listing.mine ? null : (
        <button
          type="button"
          className="tf-btn--cta"
          disabled={busy}
          onClick={() => onLicense(listing)}
        >
          {active && busy ? "Licensing…" : "License this trip"}
        </button>
      )}
      {active && license.kind === "refused" ? <p role="alert">{license.message}</p> : null}
    </article>
  );
}

function LicenseReceiptPanel({
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

function ListingForm({
  picker,
  values,
  form,
  pickedCurrency,
  onUpdate,
  onSubmit,
}: {
  picker: PickerState;
  values: ListingFormValues;
  form: ListingFormState;
  pickedCurrency: string;
  onUpdate: <K extends keyof ListingFormValues>(field: K, value: ListingFormValues[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (picker.phase === "loading") {
    return (
      <p className="tf-drafting" aria-live="polite">
        <span className="tf-spin" aria-hidden="true" />
        Loading your itineraries…
      </p>
    );
  }
  if (picker.phase === "failed") {
    return <p role="alert">{picker.message}</p>;
  }
  if (picker.itineraries.length === 0) {
    return (
      <p className="tf-market-empty" data-testid="no-itineraries">
        Nothing to list yet — <Link href="/workspace">draft an itinerary in the workspace</Link>{" "}
        first, then come back to put it on the marketplace.
      </p>
    );
  }

  const submitting = form.phase === "submitting";
  return (
    <>
      <form onSubmit={onSubmit} className="tf-market-form">
        <label htmlFor="listItineraryId">
          Itinerary
          <select
            id="listItineraryId"
            name="listItineraryId"
            value={values.itineraryId}
            disabled={submitting}
            onChange={(e) => onUpdate("itineraryId", e.target.value)}
          >
            <option value="">Pick an itinerary…</option>
            {picker.itineraries.map((itinerary) => (
              <option key={itinerary.id} value={itinerary.id}>
                {itinerary.title} ({itinerary.currency})
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="listingTitle">
          Listing title
          <input
            id="listingTitle"
            name="listingTitle"
            type="text"
            placeholder="e.g. Paris on a budget — proven weekender"
            value={values.title}
            disabled={submitting}
            onChange={(e) => onUpdate("title", e.target.value)}
          />
        </label>
        <label htmlFor="listingFee">
          License fee{pickedCurrency ? ` (${pickedCurrency})` : ""}
          <input
            id="listingFee"
            name="listingFee"
            type="number"
            min={0}
            step="0.01"
            placeholder="e.g. 250"
            value={values.feeMajor}
            disabled={submitting}
            aria-describedby={pickedCurrency ? undefined : "listingFeeHint"}
            onChange={(e) => onUpdate("feeMajor", e.target.value)}
          />
        </label>
        {/* Outside the label on purpose: a hint belongs in the field's
            DESCRIPTION, not its accessible NAME (which label content becomes —
            "itinerary" in the name would break the field's identity). */}
        {pickedCurrency ? null : (
          <small id="listingFeeHint">
            Priced in the picked itinerary&apos;s own currency — pick one above.
          </small>
        )}
        <label htmlFor="listingTerms">
          License terms
          <textarea
            id="listingTerms"
            name="listingTerms"
            rows={3}
            placeholder="e.g. White-label permitted; keep attribution lineage."
            value={values.licenseTerms}
            disabled={submitting}
            onChange={(e) => onUpdate("licenseTerms", e.target.value)}
          />
        </label>
        <label htmlFor="listingShare">
          Revenue share %
          <input
            id="listingShare"
            name="listingShare"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={values.sharePercent}
            disabled={submitting}
            onChange={(e) => onUpdate("sharePercent", e.target.value)}
          />
        </label>
        <button type="submit" className="tf-btn--cta" disabled={submitting}>
          {submitting ? "Listing…" : "List it on the marketplace"}
        </button>
      </form>
      {form.phase === "refused" ? <p role="alert">{form.message}</p> : null}
      {form.phase === "listed" ? (
        <p className="tf-market-listed" data-testid="listing-created">
          Listed — your trip is live on the marketplace above.
        </p>
      ) : null}
    </>
  );
}
