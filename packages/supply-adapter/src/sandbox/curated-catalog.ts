// Curated hero-city supply catalog (demo-01-seed, spec 017). Replaces the
// generic procedural placeholder ("<City> Grand", no images) with realistic,
// named content for a small set of showcase destinations — product-facing:
// ANY planner request for one of these cities (seed script or a live agent)
// gets this content, not just the seed script. Every other destination keeps
// today's procedural generation unchanged (see hotel.ts/activity.ts/
// transfer.ts's search() methods). Images are licensed Unsplash CDN URLs
// (images.unsplash.com / plus.unsplash.com — Unsplash's own dynamic-resize
// query params, no API key required), each carrying a photographer
// attribution (Compliance & Content Sourcing — licensed and real only).
export interface CuratedOfferFixture {
  title: string;
  description: string;
  imageUrl: string;
  attribution: string;
  netRateMinor: number;
  currency: string;
}

export interface CuratedActivityFixture extends CuratedOfferFixture {
  durationMinutes: number;
}

/** Transfers are logistics, not marketing content (industry-catalog norm) — no imagery. */
export interface CuratedTransferFixture {
  title: string;
  netRateMinor: number;
  currency: string;
  mode: "private" | "shared";
}

export interface CuratedCityCatalog {
  hotels: CuratedOfferFixture[];
  activities: CuratedActivityFixture[];
  transfers: CuratedTransferFixture[];
}

function unsplash(photoId: string): string {
  return `https://${photoId.startsWith("premium_photo") ? "plus" : "images"}.unsplash.com/${photoId}?q=80&w=1200&auto=format&fit=crop`;
}

const CURATED_CITIES: Record<string, CuratedCityCatalog> = {
  lisbon: {
    hotels: [
      {
        title: "Palácio da Baixa",
        description: "A restored 18th-century townhouse hotel in the heart of downtown Lisbon.",
        imageUrl: unsplash("photo-1536663815808-535e2280d2c2"),
        attribution: "Photo by Tom Byrom on Unsplash",
        netRateMinor: 21_000,
        currency: "USD",
      },
      {
        title: "Casa do Alfama",
        description: "A family-run guesthouse tucked into Alfama's cobbled hillside lanes.",
        imageUrl: unsplash("photo-1525207934214-58e69a8f8a3e"),
        attribution: "Photo by Andreas Brücker on Unsplash",
        netRateMinor: 15_500,
        currency: "USD",
      },
      {
        title: "Chiado Boutique Suites",
        description: "Design-forward suites steps from Chiado's cafés and viewpoints.",
        imageUrl: unsplash("photo-1605641532626-5ab1dab56350"),
        attribution: "Photo by Veronika Martinelli on Unsplash",
        netRateMinor: 26_500,
        currency: "USD",
      },
    ],
    activities: [
      {
        title: "Alfama Old Town Walking Tour",
        description: "A local guide leads you through Alfama's fado bars and hidden viewpoints.",
        imageUrl: unsplash("photo-1548707309-dcebeab9ea9b"),
        attribution: "Photo by Claudio Schwarz on Unsplash",
        netRateMinor: 4_200,
        currency: "EUR",
        durationMinutes: 90,
      },
      {
        title: "Tagus River Sunset Cruise",
        description: "Watch the sun set behind the 25 de Abril Bridge from the water.",
        imageUrl: unsplash("photo-1578859651203-c7126a106b59"),
        attribution: "Photo by Louis Droege on Unsplash",
        netRateMinor: 5_800,
        currency: "EUR",
        durationMinutes: 120,
      },
      {
        title: "Tram 28 Heritage Ride & Miradouro Tour",
        description: "Ride Lisbon's iconic yellow tram past its best hillside viewpoints.",
        imageUrl: unsplash("photo-1585208798174-6cedd86e019a"),
        attribution: "Photo by Aayush Gupta on Unsplash",
        netRateMinor: 3_500,
        currency: "EUR",
        durationMinutes: 100,
      },
      {
        title: "Belém Pastel de Nata Tasting Walk",
        description: "Sample the original custard tart alongside Belém's monuments.",
        imageUrl: unsplash("photo-1533421821268-87e42c1d70b0"),
        attribution: "Photo by Diego García on Unsplash",
        netRateMinor: 4_800,
        currency: "EUR",
        durationMinutes: 90,
      },
    ],
    transfers: [
      { title: "Private transfer", netRateMinor: 6_500, currency: "USD", mode: "private" },
      { title: "Shared shuttle", netRateMinor: 2_800, currency: "USD", mode: "shared" },
    ],
  },
  tokyo: {
    hotels: [
      {
        title: "Asakusa Riverside Ryokan",
        description: "A traditional ryokan with tatami rooms overlooking the Sumida River.",
        imageUrl: unsplash("photo-1557409518-691ebcd96038"),
        attribution: "Photo by Yu Kato on Unsplash",
        netRateMinor: 24_000,
        currency: "USD",
      },
      {
        title: "Shibuya Sky Tower Hotel",
        description: "Sleek high-rise rooms above Shibuya's neon crossing.",
        imageUrl: unsplash("photo-1604928141064-207cea6f571f"),
        attribution: "Photo by Takashi Miyazaki on Unsplash",
        netRateMinor: 32_000,
        currency: "USD",
      },
      {
        title: "Yanaka Machiya House",
        description: "A converted machiya townhouse in Tokyo's old-town Yanaka district.",
        imageUrl: unsplash("photo-1480796927426-f609979314bd"),
        attribution: "Photo by Clay Banks on Unsplash",
        netRateMinor: 17_500,
        currency: "USD",
      },
    ],
    activities: [
      {
        title: "Senso-ji & Asakusa Morning Tour",
        description: "Explore Tokyo's oldest temple before the crowds arrive.",
        imageUrl: unsplash("photo-1545569341-9eb8b30979d9"),
        attribution: "Photo by Su San Lee on Unsplash",
        netRateMinor: 4_000,
        currency: "EUR",
        durationMinutes: 90,
      },
      {
        title: "Shibuya Crossing & Neon Nights Walk",
        description: "See the world's busiest crossing come alive after dark.",
        imageUrl: unsplash("photo-1503899036084-c55cdd92da26"),
        attribution: "Photo by Erik Eastman on Unsplash",
        netRateMinor: 4_500,
        currency: "EUR",
        durationMinutes: 100,
      },
      {
        title: "Tsukiji Outer Market Food Crawl",
        description: "Taste your way through Tokyo's legendary fish market stalls.",
        imageUrl: unsplash("photo-1542051841857-5f90071e7989"),
        attribution: "Photo by Jezael Melgoza on Unsplash",
        netRateMinor: 6_200,
        currency: "EUR",
        durationMinutes: 120,
      },
      {
        title: "Cherry Blossom Cruise on the Sumida",
        description: "A boat ride beneath Tokyo's most famous sakura trees (seasonal).",
        imageUrl: unsplash("photo-1522547902298-51566e4fb383"),
        attribution: "Photo by Yu Kato on Unsplash",
        netRateMinor: 5_500,
        currency: "EUR",
        durationMinutes: 90,
      },
    ],
    transfers: [
      { title: "Private transfer", netRateMinor: 8_500, currency: "USD", mode: "private" },
      { title: "Shared shuttle", netRateMinor: 3_200, currency: "USD", mode: "shared" },
    ],
  },
  marrakech: {
    hotels: [
      {
        title: "Riad Dar Zahia",
        description: "An intimate riad with a citrus-scented courtyard in the medina.",
        imageUrl: unsplash("premium_photo-1699555731640-415f47a252d8"),
        attribution: "Photo by Ahmed on Unsplash",
        netRateMinor: 16_500,
        currency: "USD",
      },
      {
        title: "Kasbah Atlas Lodge",
        description: "Boutique rooms with Atlas Mountain views on the edge of the medina.",
        imageUrl: unsplash("premium_photo-1673415819362-c2ca640bfafe"),
        attribution: "Photo by Joe Eitzen on Unsplash",
        netRateMinor: 22_000,
        currency: "USD",
      },
      {
        title: "Jemaa Courtyard Suites",
        description: "Modern suites around a tiled courtyard steps from Jemaa el-Fna.",
        imageUrl: unsplash("photo-1549140600-78c9b8275e9d"),
        attribution: "Photo by Pommelien da Silva Cosme on Unsplash",
        netRateMinor: 19_500,
        currency: "USD",
      },
    ],
    activities: [
      {
        title: "Jemaa el-Fna Night Market Walk",
        description: "Explore the square's storytellers, food stalls, and musicians after dark.",
        imageUrl: unsplash("photo-1587974928442-77dc3e0dba72"),
        attribution: "Photo by CALIN STAN on Unsplash",
        netRateMinor: 3_800,
        currency: "EUR",
        durationMinutes: 90,
      },
      {
        title: "Souks & Spice Market Guided Tour",
        description: "Navigate the medina's dyers', spice, and lantern souks with a local guide.",
        imageUrl: unsplash("photo-1580746738099-1cb74f972feb"),
        attribution: "Photo by zakariae daoui on Unsplash",
        netRateMinor: 4_200,
        currency: "EUR",
        durationMinutes: 100,
      },
      {
        title: "Atlas Mountains Day Trip",
        description: "A day trip into the foothills of the Atlas Mountains and Berber villages.",
        imageUrl: unsplash("photo-1597212618440-806262de4f6b"),
        attribution: "Photo by Paul Macallan on Unsplash",
        netRateMinor: 7_500,
        currency: "EUR",
        durationMinutes: 240,
      },
      {
        title: "Koutoubia Mosque & Medina Rooftop Views",
        description: "Take in Marrakech's skyline from a rooftop terrace near the Koutoubia minaret.",
        imageUrl: unsplash("premium_photo-1697730075333-822144628df6"),
        attribution: "Photo by Getty Images on Unsplash",
        netRateMinor: 3_600,
        currency: "EUR",
        durationMinutes: 75,
      },
    ],
    transfers: [
      { title: "Private transfer", netRateMinor: 5_800, currency: "USD", mode: "private" },
      { title: "Shared shuttle", netRateMinor: 2_200, currency: "USD", mode: "shared" },
    ],
  },
  reykjavik: {
    hotels: [
      {
        title: "Hotel Aurora Harpa",
        description: "Modern rooms near the waterfront concert hall, prime for northern-lights viewing.",
        imageUrl: unsplash("photo-1606130503037-6a8ef67c9d2d"),
        attribution: "Photo by Einar H. Reynis on Unsplash",
        netRateMinor: 23_500,
        currency: "USD",
      },
      {
        title: "Vesturbær Guesthouse",
        description: "A cozy guesthouse in a quiet residential district near the old harbor.",
        imageUrl: unsplash("photo-1602167352652-52dba4750482"),
        attribution: "Photo by Annie Spratt on Unsplash",
        netRateMinor: 15_800,
        currency: "USD",
      },
      {
        title: "Öskjuhlíð Hilltop Lodge",
        description: "Hilltop rooms with views over Reykjavik and the bay beyond.",
        imageUrl: unsplash("photo-1465353471565-b77e538f34c9"),
        attribution: "Photo by Evelyn Paris on Unsplash",
        netRateMinor: 27_500,
        currency: "USD",
      },
    ],
    activities: [
      {
        title: "Golden Circle Day Tour",
        description: "Visit Þingvellir, Geysir, and Gullfoss waterfall in a single day.",
        imageUrl: unsplash("photo-1608468716860-5566b7671ea3"),
        attribution: "Photo by Tom Podmore on Unsplash",
        netRateMinor: 8_500,
        currency: "EUR",
        durationMinutes: 300,
      },
      {
        title: "Northern Lights Hunting Tour",
        description: "Chase the aurora borealis with a local guide away from city lights.",
        imageUrl: unsplash("photo-1529963183134-61a90db47eaf"),
        attribution: "Photo by Nicolas J Leclercq on Unsplash",
        netRateMinor: 7_200,
        currency: "EUR",
        durationMinutes: 240,
      },
      {
        title: "Reykjavik Old Harbour Walking Tour",
        description: "Wander the colorful old harbour and its street art.",
        imageUrl: unsplash("photo-1474690870753-1b92efa1f2d8"),
        attribution: "Photo by Fernando Strabuli on Unsplash",
        netRateMinor: 3_600,
        currency: "EUR",
        durationMinutes: 90,
      },
      {
        title: "Blue Lagoon Geothermal Spa Day",
        description: "Soak in the milky-blue geothermal waters outside the city.",
        imageUrl: unsplash("photo-1630316710923-60d1c6935503"),
        attribution: "Photo by Héloïse Delbos on Unsplash",
        netRateMinor: 9_500,
        currency: "EUR",
        durationMinutes: 180,
      },
    ],
    transfers: [
      { title: "Private transfer", netRateMinor: 9_000, currency: "USD", mode: "private" },
      { title: "Shared shuttle", netRateMinor: 3_800, currency: "USD", mode: "shared" },
    ],
  },
};

/** Case-insensitive, whitespace-trimmed lookup; `undefined` for any non-hero destination. */
export function lookupCuratedCity(destination: string): CuratedCityCatalog | undefined {
  return CURATED_CITIES[destination.trim().toLowerCase()];
}
