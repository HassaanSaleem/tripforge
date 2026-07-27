// /view/marketplace — honest "coming soon" for a traveler's hopeful marketplace
// URL (FRICTION-7). Static segment, resolved ahead of /view/[token] (research
// D2), so a non-token word never falls through to the dead-token message.
// Brand-neutral (INV-020); no platform naming in body or title.
import type { Metadata } from "next";
import { DiscoveryComing } from "../discovery-coming.js";

export const metadata: Metadata = {
  title: "Browse trips — coming soon",
  robots: { index: false, follow: false },
};

export default function ClientMarketplacePage() {
  return <DiscoveryComing heading="Browse trips" />;
}
