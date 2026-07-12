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
//
// This orchestrator owns state + server calls only; the browse/listing grid,
// license/receipt flow, and sell form render via sibling components in this
// directory (file-length quality-sweep, QS3-9).
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { trpc } from "../../../lib/trpc/client.js";
import {
  createListingFailureMessage,
  deactivateListingFailureMessage,
  licenseFailureMessage,
  marketplaceErrorMessage,
  rateListingFailureMessage,
  toCreateListingInput,
  type ListingFormValues,
  type MarketplaceListing,
} from "../../../lib/marketplace-flow.js";
import { LicenseReceiptPanel } from "./license-receipt-panel.js";
import { ListingCard } from "./listing-browse.js";
import { ListingForm, readListingFormValues } from "./listing-form.js";
import {
  INITIAL_FORM,
  type BrowseState,
  type DeactivateState,
  type LicenseState,
  type ListingFormState,
  type PickerState,
  type RatingState,
} from "./marketplace-panel-types.js";

export function MarketplacePanel() {
  const [browse, setBrowse] = useState<BrowseState>({ phase: "loading" });
  const [picker, setPicker] = useState<PickerState>({ phase: "loading" });
  const [values, setValues] = useState<ListingFormValues>(INITIAL_FORM);
  const [form, setForm] = useState<ListingFormState>({ phase: "idle" });
  const [license, setLicense] = useState<LicenseState>(null);
  const [rating, setRating] = useState<RatingState>(null);
  const [deactivate, setDeactivate] = useState<DeactivateState>(null);

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
        // The just-listed itinerary must drop out of its OWN picker too
        // (seed-0016-class staleness) — else re-opening the form offers it
        // again as if listable, the exact friction this picker filter exists
        // to remove.
        await Promise.all([loadListings(), loadItineraries()]);
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

  async function handleRate(listingId: string, stars: number, comment: string) {
    if (rating?.kind === "busy") return;
    setRating({ listingId, kind: "busy" });
    try {
      const outcome = await trpc.workspace.marketplace.rateListing.mutate({
        listingId,
        stars,
        ...(comment.trim() === "" ? {} : { comment: comment.trim() }),
      });
      if (outcome.status === "rated") {
        setRating({ listingId, kind: "rated", ratingAverage: outcome.ratingAverage, ratingCount: outcome.ratingCount });
        // The aggregate on the card is server-derived (formatRating) — reload
        // so every viewer's next render shows the same number (FR-011).
        await loadListings();
      } else {
        setRating({ listingId, kind: "refused", message: rateListingFailureMessage(outcome) });
      }
    } catch (error) {
      setRating({ listingId, kind: "refused", message: marketplaceErrorMessage(error) });
    }
  }

  async function handleDeactivate(listingId: string) {
    if (deactivate?.kind === "busy") return;
    setDeactivate({ listingId, kind: "busy" });
    try {
      const outcome = await trpc.workspace.marketplace.deactivateListing.mutate({ listingId });
      if (outcome.status === "deactivated") {
        setDeactivate({ listingId, kind: "deactivated" });
        // The listing must disappear from browse in place (FR-011) — no
        // stale "active" card left over after taking it off the market.
        await loadListings();
      } else {
        setDeactivate({ listingId, kind: "refused", message: deactivateListingFailureMessage(outcome) });
      }
    } catch (error) {
      setDeactivate({ listingId, kind: "refused", message: marketplaceErrorMessage(error) });
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
                rating={rating}
                onRate={handleRate}
                deactivate={deactivate}
                onDeactivate={handleDeactivate}
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
          provenance for future resales. First-sale earnings always use the
          platform&apos;s fixed take rate, not this declared share.
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
