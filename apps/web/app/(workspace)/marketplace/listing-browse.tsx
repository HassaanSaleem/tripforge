// Browse/listing-grid section of the marketplace panel — one card per live
// listing (license, rate, or take-off-marketplace actions), split out of
// marketplace-panel.tsx (file-length quality-sweep, QS3-9).
"use client";

import { useState, type FormEvent } from "react";
import { formatMinorAmount } from "../../../lib/planner-form.js";
import {
  formatEarnings,
  formatRating,
  formatShareBps,
  type MarketplaceListing,
} from "../../../lib/marketplace-flow.js";
import type { DeactivateState, LicenseState, RatingState } from "./marketplace-panel-types.js";

export function ListingCard({
  listing,
  license,
  onLicense,
  rating,
  onRate,
  deactivate,
  onDeactivate,
}: {
  listing: MarketplaceListing;
  license: LicenseState;
  onLicense: (listing: MarketplaceListing) => void;
  rating: RatingState;
  onRate: (listingId: string, stars: number, comment: string) => void;
  deactivate: DeactivateState;
  onDeactivate: (listingId: string) => void;
}) {
  const active = license !== null && license.listingId === listing.listingId;
  const busy = license?.kind === "busy";
  const activeDeactivate = deactivate !== null && deactivate.listingId === listing.listingId;
  const deactivating = deactivate?.kind === "busy";
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
        <>
          <p className="tf-market-earnings" data-testid="listing-earnings">
            {formatEarnings(listing.licenseCount, listing.sellerCreditTotalMinor, listing.currency)}
          </p>
          <p className="tf-market-share-note" data-testid="listing-share-note">
            Declared share applies to future resales — first-sale earnings above
            use the platform&apos;s fixed take rate, not this share.
          </p>
        </>
      ) : null}
      <p className="tf-market-terms">{listing.licenseTerms}</p>
      {listing.mine ? (
        <>
          <button
            type="button"
            className="tf-btn--ghost"
            data-testid="deactivate-listing"
            disabled={deactivating}
            onClick={() => onDeactivate(listing.listingId)}
          >
            {activeDeactivate && deactivating ? "Taking off marketplace…" : "Take off marketplace"}
          </button>
          {activeDeactivate && deactivate.kind === "refused" ? <p role="alert">{deactivate.message}</p> : null}
        </>
      ) : (
        <>
          <button
            type="button"
            className="tf-btn--cta"
            disabled={busy}
            onClick={() => onLicense(listing)}
          >
            {active && busy ? "Licensing…" : "License this trip"}
          </button>
          {active && license.kind === "refused" ? <p role="alert">{license.message}</p> : null}
          <RatingControl listingId={listing.listingId} rating={rating} onRate={onRate} />
        </>
      )}
    </article>
  );
}

function RatingControl({
  listingId,
  rating,
  onRate,
}: {
  listingId: string;
  rating: RatingState;
  onRate: (listingId: string, stars: number, comment: string) => void;
}) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const active = rating !== null && rating.listingId === listingId;
  const busy = rating?.kind === "busy";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    onRate(listingId, stars, comment);
  }

  return (
    <form className="tf-market-rate" data-testid="rate-listing-form" onSubmit={handleSubmit}>
      <label htmlFor={`rateStars-${listingId}`}>
        Your rating
        <select
          id={`rateStars-${listingId}`}
          value={stars}
          disabled={busy}
          onChange={(e) => setStars(Number(e.target.value))}
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`rateComment-${listingId}`}>
        Comment (optional)
        <input
          id={`rateComment-${listingId}`}
          type="text"
          value={comment}
          disabled={busy}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      <button type="submit" className="tf-btn--ghost" disabled={busy}>
        {active && busy ? "Submitting…" : "Submit rating"}
      </button>
      {active && rating.kind === "rated" ? (
        <p data-testid="rate-listing-confirmed">Thanks — your rating is in.</p>
      ) : null}
      {active && rating.kind === "refused" ? <p role="alert">{rating.message}</p> : null}
    </form>
  );
}
