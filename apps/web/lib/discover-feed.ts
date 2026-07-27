// Discover / "What's Hot" feed curated content (spec 023, ticket demo-08-discover).
// Static, in-repo data — not backend-fetched (research.md Decision 1): non-tenant,
// non-money, hand-curated content, same rationale as HERO_DESTINATIONS in
// planner-form.ts. Photo IDs + attributions are reused from the vetted,
// unmerged salvage/demo-01-seed-partial:packages/supply-adapter/src/sandbox/
// curated-catalog.ts (research.md Decision 2) — same licensed Unsplash CDN
// convention (images.unsplash.com / plus.unsplash.com, no API key required),
// extracted here without any supply-adapter/booking fields (net rates,
// currency, duration) since Discover content isn't bookable inventory.
import { HERO_DESTINATIONS, type HeroDestination } from "./planner-form.js";

export interface DiscoverFeedItem {
  id: string;
  destinationId: HeroDestination["id"];
  title: string;
  blurb: string;
  image: {
    url: string;
    alt: string;
    attribution: string;
    /** Matches MediaSourceSchema's vocabulary (packages/itinerary-schema/src/media.ts) — always licensed-stock for this curated set. */
    source: "licensed-stock";
  };
  hotelHighlight: {
    name: string;
    description: string;
  };
  /** Exact "${city}, ${country}" value to pre-seed the AI builder with (contracts/discover-to-builder-handoff.md). */
  planDestination: string;
}

function unsplash(photoId: string): string {
  return `https://${photoId.startsWith("premium_photo") ? "plus" : "images"}.unsplash.com/${photoId}?q=80&w=1200&auto=format&fit=crop`;
}

interface HotelFixture {
  name: string;
  description: string;
}

const HOTELS: Record<HeroDestination["id"], HotelFixture[]> = {
  lisbon: [
    { name: "Memmo Alfama", description: "A design boutique hotel near Lisbon Cathedral and São Jorge Castle, named one of the world's best new urban hotels." },
    { name: "Santiago de Alfama", description: "A 15th-century Alfama palace turned luxury boutique hotel." },
    { name: "AlmaLusa Alfama", description: "A boutique hotel set in a centuries-old building in the heart of Alfama." },
  ],
  tokyo: [
    { name: "Prostyle Ryokan Tokyo Asakusa", description: "A tatami-room ryokan near Kaminarimon and the Sumida River, with balcony views toward Tokyo Skytree." },
    { name: "Hotel Indigo Tokyo Shibuya", description: "A boutique hotel five minutes from Shibuya Station, steps from the Scramble Crossing." },
    { name: "Annex Katsutaro Ryokan", description: "A traditional ryokan in the heart of Yanaka, steps from the Yanaka Ginza old-town shopping street." },
  ],
  marrakech: [
    { name: "Riad BE Marrakech", description: "A boutique riad in the medina near Jemaa el-Fna, with a hammam spa and rooftop yoga terrace." },
    { name: "Riad Kheirredine", description: "An intimate luxury riad hidden in the medina near Jemaa el-Fnaa." },
    { name: "Riad Jemaa El Fna & Spa", description: "A boutique riad set directly on Jemaa El Fna Square in the heart of the medina." },
  ],
  reykjavik: [
    { name: "The Reykjavik EDITION", description: "A luxury hotel on the Old Harbour, adjacent to the Harpa concert hall." },
    { name: "Center Hotels Grandi", description: "A stylish hotel in Reykjavik's Grandi district near the Old Harbour." },
    { name: "Center Hotels Plaza", description: "A central hotel on Ingólfstorg, Reykjavik's oldest square." },
  ],
};

interface ActivityFixture {
  slug: string;
  title: string;
  blurb: string;
  photoId: string;
  attribution: string;
}

const ACTIVITIES: Record<HeroDestination["id"], ActivityFixture[]> = {
  lisbon: [
    {
      slug: "alfama-walking-tour",
      title: "Alfama Old Town Walking Tour",
      blurb: "A local guide leads you through Alfama's fado bars and hidden viewpoints.",
      photoId: "photo-1548707309-dcebeab9ea9b",
      attribution: "Photo by Claudio Schwarz on Unsplash",
    },
    {
      slug: "tagus-sunset-cruise",
      title: "Tagus River Sunset Cruise",
      blurb: "Watch the sun set behind the 25 de Abril Bridge from the water.",
      photoId: "photo-1578859651203-c7126a106b59",
      attribution: "Photo by Louis Droege on Unsplash",
    },
    {
      slug: "tram-28-heritage-ride",
      title: "Tram 28 Heritage Ride & Miradouro Tour",
      blurb: "Ride Lisbon's iconic yellow tram past its best hillside viewpoints.",
      photoId: "photo-1585208798174-6cedd86e019a",
      attribution: "Photo by Aayush Gupta on Unsplash",
    },
    {
      slug: "belem-pastel-de-nata-walk",
      title: "Belém Pastel de Nata Tasting Walk",
      blurb: "Sample the original custard tart alongside Belém's monuments.",
      photoId: "photo-1533421821268-87e42c1d70b0",
      attribution: "Photo by Diego García on Unsplash",
    },
  ],
  tokyo: [
    {
      slug: "sensoji-asakusa-morning-tour",
      title: "Senso-ji & Asakusa Morning Tour",
      blurb: "Explore Tokyo's oldest temple before the crowds arrive.",
      photoId: "photo-1545569341-9eb8b30979d9",
      attribution: "Photo by Su San Lee on Unsplash",
    },
    {
      slug: "shibuya-crossing-neon-nights",
      title: "Shibuya Crossing & Neon Nights Walk",
      blurb: "See the world's busiest crossing come alive after dark.",
      photoId: "photo-1503899036084-c55cdd92da26",
      attribution: "Photo by Erik Eastman on Unsplash",
    },
    {
      slug: "tsukiji-outer-market-food-crawl",
      title: "Tsukiji Outer Market Food Crawl",
      blurb: "Taste your way through Tokyo's legendary fish market stalls.",
      photoId: "photo-1542051841857-5f90071e7989",
      attribution: "Photo by Jezael Melgoza on Unsplash",
    },
    {
      slug: "sumida-cherry-blossom-cruise",
      title: "Cherry Blossom Cruise on the Sumida",
      blurb: "A boat ride beneath Tokyo's most famous sakura trees (seasonal).",
      photoId: "photo-1522547902298-51566e4fb383",
      attribution: "Photo by Yu Kato on Unsplash",
    },
  ],
  marrakech: [
    {
      slug: "jemaa-el-fna-night-market-walk",
      title: "Jemaa el-Fna Night Market Walk",
      blurb: "Explore the square's storytellers, food stalls, and musicians after dark.",
      photoId: "photo-1587974928442-77dc3e0dba72",
      attribution: "Photo by CALIN STAN on Unsplash",
    },
    {
      slug: "souks-spice-market-tour",
      title: "Souks & Spice Market Guided Tour",
      blurb: "Navigate the medina's dyers', spice, and lantern souks with a local guide.",
      photoId: "photo-1580746738099-1cb74f972feb",
      attribution: "Photo by zakariae daoui on Unsplash",
    },
    {
      slug: "atlas-mountains-day-trip",
      title: "Atlas Mountains Day Trip",
      blurb: "A day trip into the foothills of the Atlas Mountains and Berber villages.",
      photoId: "photo-1597212618440-806262de4f6b",
      attribution: "Photo by Paul Macallan on Unsplash",
    },
    {
      slug: "koutoubia-rooftop-views",
      title: "Koutoubia Mosque & Medina Rooftop Views",
      blurb: "Take in Marrakech's skyline from a rooftop terrace near the Koutoubia minaret.",
      photoId: "premium_photo-1697730075333-822144628df6",
      attribution: "Photo by Getty Images on Unsplash",
    },
  ],
  reykjavik: [
    {
      slug: "golden-circle-day-tour",
      title: "Golden Circle Day Tour",
      blurb: "Visit Þingvellir, Geysir, and Gullfoss waterfall in a single day.",
      photoId: "photo-1608468716860-5566b7671ea3",
      attribution: "Photo by Tom Podmore on Unsplash",
    },
    {
      slug: "northern-lights-hunting-tour",
      title: "Northern Lights Hunting Tour",
      blurb: "Chase the aurora borealis with a local guide away from city lights.",
      photoId: "photo-1529963183134-61a90db47eaf",
      attribution: "Photo by Nicolas J Leclercq on Unsplash",
    },
    {
      slug: "old-harbour-walking-tour",
      title: "Reykjavik Old Harbour Walking Tour",
      blurb: "Wander the colorful old harbour and its street art.",
      photoId: "photo-1474690870753-1b92efa1f2d8",
      attribution: "Photo by Fernando Strabuli on Unsplash",
    },
    {
      slug: "blue-lagoon-spa-day",
      title: "Blue Lagoon Geothermal Spa Day",
      blurb: "Soak in the milky-blue geothermal waters outside the city.",
      photoId: "photo-1630316710923-60d1c6935503",
      attribution: "Photo by Héloïse Delbos on Unsplash",
    },
  ],
};

function buildFeedItems(): DiscoverFeedItem[] {
  const items: DiscoverFeedItem[] = [];
  HERO_DESTINATIONS.forEach((hero) => {
    // Non-null: HOTELS/ACTIVITIES are populated for every HERO_DESTINATIONS id
    // by construction (both Records are keyed off the same 4 ids), but
    // Record indexed access is still `| undefined` under noUncheckedIndexedAccess.
    const hotels = HOTELS[hero.id]!;
    const activities = ACTIVITIES[hero.id]!;
    const planDestination = `${hero.city}, ${hero.country}`;
    activities.forEach((activity, index) => {
      const hotel = hotels[index % hotels.length]!;
      items.push({
        id: `${hero.id}-${activity.slug}`,
        destinationId: hero.id,
        title: activity.title,
        blurb: activity.blurb,
        image: {
          url: unsplash(activity.photoId),
          alt: `${activity.title} in ${planDestination}`,
          attribution: activity.attribution,
          source: "licensed-stock",
        },
        hotelHighlight: hotel,
        planDestination,
      });
    });
  });
  return items;
}

/** ≥3 items per HERO_DESTINATIONS entry (spec SC-004); real, licensed, attributed imagery only (FR-007). */
export const WHATS_HOT_FEED: DiscoverFeedItem[] = buildFeedItems();

export function feedItemsForDestination(destinationId: HeroDestination["id"]): DiscoverFeedItem[] {
  return WHATS_HOT_FEED.filter((item) => item.destinationId === destinationId);
}

/**
 * The "Plan this" handoff URL a Discover feed card links to (spec 039,
 * contracts/discover-to-consumer-planner-handoff.md). `planPath` is the base path
 * of the AI planner for the surface rendering the feed — "/workspace" for the agent
 * workspace, "/view/plan" for the traveler consumer surface — so the same card
 * component serves both without either route group importing the other's UI
 * (INV-024). Pure + surface-agnostic, so the cross-page contract is L1-testable.
 */
export function discoverPlanHref(planPath: string, planDestination: string): string {
  return `${planPath}?destination=${encodeURIComponent(planDestination)}`;
}
