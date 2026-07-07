// Shared L1 fixtures for the itinerary-schema tests. This is NOT a *.test.ts file,
// so Vitest does not execute it as a suite; it only supplies representative,
// pre-parse input objects the specs can build on and mutate. Everything is USD so
// the single-currency refinement (FR-008) passes unless a test deliberately breaks it.

/** A fully-populated, currency-consistent itinerary input (≥2 days, all 3 item kinds). */
export function baseItineraryInput(): Record<string, unknown> {
  return {
    schemaVersion: "0.1.0",
    id: "itin_001",
    agencyId: "ag_alpha",
    title: "5 Nights in Lisbon",
    currency: "USD",
    days: [
      {
        dayNumber: 1,
        date: "2026-09-01",
        items: [
          {
            kind: "stay",
            id: "stay_1",
            title: "Hotel Baixa",
            supplyRef: { port: "hotel", externalId: "RH-abc123" },
            media: [
              {
                id: "m1",
                kind: "image",
                storageKey: "media/lisbon/hotel1.jpg",
                source: "licensed-stock",
                alt: "Hotel facade",
              },
            ],
            pricing: {
              netRate: { amountMinor: 42000, currency: "USD" },
              sellPrice: { amountMinor: 52000, currency: "USD" },
            },
            checkIn: "2026-09-01",
            checkOut: "2026-09-03",
            occupancy: { adults: 2, children: 0 },
          },
          {
            kind: "activity",
            id: "act_1",
            title: "Fado evening",
            startsAt: "2026-09-01T20:00:00Z",
            durationMinutes: 120,
          },
        ],
      },
      {
        dayNumber: 2,
        items: [
          {
            kind: "transfer",
            id: "tr_1",
            title: "Airport transfer",
            from: "LIS Airport",
            to: "Hotel Baixa",
            mode: "private",
            pricing: {
              netRate: { amountMinor: 3000, currency: "USD" },
              sellPrice: { amountMinor: 4000, currency: "USD" },
            },
          },
        ],
      },
    ],
    media: [
      {
        id: "cover",
        kind: "image",
        url: "https://cdn.example.com/lisbon.jpg",
        source: "official-embed",
        alt: "Lisbon skyline",
      },
    ],
    pricing: {
      budgetMode: "hardCap",
      total: { amountMinor: 300000, currency: "USD" },
      categories: [
        { category: "accommodation", allocated: { amountMinor: 120000, currency: "USD" } },
        { category: "activities", allocated: { amountMinor: 30000, currency: "USD" } },
      ],
    },
    provenance: {
      originalAuthorAgencyId: "ag_alpha",
      licenseTerms: "resale-allowed-v1",
      revenueShareBps: 1500,
      rebrandLineage: [],
    },
  };
}
