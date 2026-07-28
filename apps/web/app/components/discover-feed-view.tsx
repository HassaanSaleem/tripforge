// Discover / "What's Hot" feed body (spec 023 US1, generalized in spec 039) —
// destination picker (reuses HERO_DESTINATIONS, the same seed set the planners'
// own pickers use) + a feed grid of that destination's curated items. SHARED,
// user-type-agnostic component: both the agent workspace Discover and the traveler
// consumer Discover render this, differing only by `planPath` (the base path each
// card's "Plan this" links into). Kept out of either route group so neither
// imports the other's UI (INV-024).
"use client";

import { useState } from "react";
import { HERO_DESTINATIONS } from "../../lib/planner-form.js";
import { feedItemsForDestination } from "../../lib/discover-feed.js";
import { DiscoverFeedCard } from "./discover-feed-card.js";

export function DiscoverFeedView({ planPath }: { planPath: string }) {
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
          <DiscoverFeedCard key={item.id} item={item} planPath={planPath} />
        ))}
      </div>
    </>
  );
}
