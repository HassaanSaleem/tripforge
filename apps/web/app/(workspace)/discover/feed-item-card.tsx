// One image-forward "what's hot" card (spec 023 US1/US2/US3) — photo, blurb,
// hotel highlight, and the "Plan this" handoff into the AI builder. Split out
// of discover-feed-view.tsx per this repo's card-component-per-file precedent
// (marketplace listing-browse.tsx's ListingCard, group-trip-card.tsx's
// GroupTripCard). An image load failure never hides the rest of the card
// (spec Edge Cases) — it swaps to a labeled fallback panel instead.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DiscoverFeedItem } from "../../../lib/discover-feed.js";

export function FeedItemCard({ item }: { item: DiscoverFeedItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const planHref = `/workspace?destination=${encodeURIComponent(item.planDestination)}`;

  // A load failure that happens before hydration attaches onError (the
  // browser's native <img> error event can fire during SSR-to-client
  // handoff) would otherwise be missed — check the already-settled state on
  // mount, same as onError would report it.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setImageFailed(true);
    }
  }, []);

  return (
    <article className="tf-discover-card" data-testid="discover-feed-card">
      <div className="tf-discover-card-media">
        {imageFailed ? (
          <div className="tf-discover-card-media-fallback" data-testid="discover-card-image-fallback">
            {item.title}
          </div>
        ) : (
          <img
            ref={imgRef}
            src={item.image.url}
            alt={item.image.alt}
            onError={() => setImageFailed(true)}
            loading="lazy"
          />
        )}
        <span className="tf-discover-card-attribution">{item.image.attribution}</span>
      </div>
      <div className="tf-discover-card-body">
        <h3>{item.title}</h3>
        <p className="tf-discover-card-blurb">{item.blurb}</p>
        <div className="tf-discover-hotel" data-testid="discover-hotel-highlight">
          <span className="tf-discover-hotel-label">Hotel highlight</span>
          <b>{item.hotelHighlight.name}</b>
          <span>{item.hotelHighlight.description}</span>
        </div>
        <Link href={planHref} className="tf-btn--cta" data-testid="discover-plan-this">
          Plan this
        </Link>
      </div>
    </article>
  );
}
