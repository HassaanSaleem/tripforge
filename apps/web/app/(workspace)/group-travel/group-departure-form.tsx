// Post (create-a-group-departure) form section of the group-travel panel,
// split out of group-travel-panel.tsx (file-length quality-sweep precedent,
// marketplace listing-form.tsx).
"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import type { PostFormValues } from "../../../lib/group-travel-flow.js";
import type { PickerState, PostFormState } from "./group-travel-panel-types.js";

/** Read the post form's values from the DOM at submit time (listing-form.tsx
 * precedent, seed-0009d-b: a refusal re-render must not snap a declared field
 * back to its default). */
export function readPostFormValues(form: HTMLFormElement): PostFormValues {
  const read = (name: string): string => {
    const field = form.elements.namedItem(name);
    return field instanceof HTMLInputElement ||
      field instanceof HTMLSelectElement ||
      field instanceof HTMLTextAreaElement
      ? field.value
      : "";
  };
  return {
    itineraryId: read("postItineraryId"),
    departureDate: read("postDepartureDate"),
    capacity: read("postCapacity"),
    priceMajor: read("postPricePerSeat"),
  };
}

export function GroupDepartureForm({
  picker,
  values,
  form,
  pickedCurrency,
  onUpdate,
  onSubmit,
}: {
  picker: PickerState;
  values: PostFormValues;
  form: PostFormState;
  pickedCurrency: string;
  onUpdate: <K extends keyof PostFormValues>(field: K, value: PostFormValues[K]) => void;
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
        Nothing to post yet — <Link href="/workspace">draft an itinerary in the workspace</Link>{" "}
        first, then come back to post it as a group departure.
      </p>
    );
  }

  const submitting = form.phase === "submitting";
  return (
    <>
      <form onSubmit={onSubmit} className="tf-market-form">
        <label htmlFor="postItineraryId">
          Itinerary
          <select
            id="postItineraryId"
            name="postItineraryId"
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
        <label htmlFor="postDepartureDate">
          Departure date
          <input
            id="postDepartureDate"
            name="postDepartureDate"
            type="date"
            value={values.departureDate}
            disabled={submitting}
            onChange={(e) => onUpdate("departureDate", e.target.value)}
          />
        </label>
        <label htmlFor="postCapacity">
          Total seats
          <input
            id="postCapacity"
            name="postCapacity"
            type="number"
            min={1}
            step="1"
            placeholder="e.g. 12"
            value={values.capacity}
            disabled={submitting}
            onChange={(e) => onUpdate("capacity", e.target.value)}
          />
        </label>
        <label htmlFor="postPricePerSeat">
          Price per seat{pickedCurrency ? ` (${pickedCurrency})` : ""}
          <input
            id="postPricePerSeat"
            name="postPricePerSeat"
            type="number"
            min={0}
            step="0.01"
            placeholder="e.g. 450"
            value={values.priceMajor}
            disabled={submitting}
            aria-describedby={pickedCurrency ? undefined : "postPriceHint"}
            onChange={(e) => onUpdate("priceMajor", e.target.value)}
          />
        </label>
        {pickedCurrency ? null : (
          <small id="postPriceHint">Priced in the picked itinerary&apos;s own currency — pick one above.</small>
        )}
        <button type="submit" className="tf-btn--cta" disabled={submitting}>
          {submitting ? "Posting…" : "Post this group departure"}
        </button>
      </form>
      {form.phase === "refused" ? <p role="alert">{form.message}</p> : null}
      {form.phase === "posted" ? (
        <p className="tf-market-listed" data-testid="departure-posted">
          Posted — your group departure is live above.
        </p>
      ) : null}
    </>
  );
}
