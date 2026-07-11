// Workspace panel composition (spec 012 research D2) — the parent that owns
// the draft→list freshness signal: sibling client components cannot observe
// each other, so a successful draft bumps refreshToken and the trips panel
// reloads without a page reload (FR-006, the seed-0016 staleness lesson).
// The server component page still gates WHO sees these panels (INV-024);
// authorization stays per tRPC procedure (INV-023).
"use client";

import { useState } from "react";
import { ItineraryList } from "./itinerary-list.js";
import { MediaLibraryPanel } from "./media-library-panel.js";
import { Planner } from "./planner.js";

export function WorkspacePanels() {
  const [refreshToken, setRefreshToken] = useState(0);
  return (
    <>
      <Planner onDrafted={() => setRefreshToken((token) => token + 1)} />
      <ItineraryList refreshToken={refreshToken} />
      <MediaLibraryPanel />
    </>
  );
}
