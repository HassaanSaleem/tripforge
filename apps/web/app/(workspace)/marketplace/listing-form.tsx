// Sell (list-an-itinerary) form section of the marketplace panel, split out
// of marketplace-panel.tsx (file-length quality-sweep, QS3-9).
"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import type { ListingFormValues } from "../../../lib/marketplace-flow.js";
import type { ListingFormState, PickerState } from "./marketplace-panel-types.js";

/**
 * Read the listing form's values from the DOM at submit time. Some real input
 * paths (browser autofill, password managers, automation fills) set a field's
 * value without the events a controlled input needs, so React state can lag
 * what the seller actually sees — and a refusal re-render would then silently
 * snap a declared term (e.g. the revenue share) back to its default
 * (seed-0009d-b, Constitution VI: the recorded split must match the declared
 * terms). The DOM is what the seller saw when they pressed submit.
 */
export function readListingFormValues(form: HTMLFormElement): ListingFormValues {
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

export function ListingForm({
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
              <option key={itinerary.id} value={itinerary.id} disabled={itinerary.listing !== null}>
                {itinerary.title} ({itinerary.currency})
                {itinerary.listing !== null ? " — already listed" : ""}
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
