// Discover / "What's Hot" feed body (spec 023 US1) — destination picker
// (reuses HERO_DESTINATIONS, the same seed set the planner's own picker
// uses) + a feed grid of that destination's curated items. Replaces the
// static "coming soon" placeholder this route previously rendered (spec 017
// research D7).
"use client";

import { useState } from "react";
import { HERO_DESTINATIONS } from "../../../lib/planner-form.js";
import { feedItemsForDestination } from "../../../lib/discover-feed.js";
import { FeedItemCard } from "./feed-item-card.js";

export function DiscoverFeedView() {
  const [selectedId, setSelectedId] = useState(HERO_DESTINATIONS[0]!.id);
  const items = feedItemsForDestination(selectedId);

  return (
    <>
      <div className="tf-discover-picker" role="tablist" aria-label="Featured destinations" data-testid="discover-destination-picker">
        {HERO_DESTINATIONS.map((hero) => (
          <button
            key={hero.id}
            type="button"
            role="tab"
            aria-pressed={hero.id === selectedId}
            aria-selected={hero.id === selectedId}
            data-testid="discover-destination-option"
            data-destination-id={hero.id}
            onClick={() => setSelectedId(hero.id)}
          >
            <span className="tf-discover-picker-flag" aria-hidden="true">
              {hero.flag}
            </span>
            {hero.city}
          </button>
        ))}
      </div>
      <div className="tf-discover-grid" data-testid="discover-feed-grid">
        {items.map((item) => (
          <FeedItemCard key={item.id} item={item} />
        ))}
      </div>
    </>
  );
}
